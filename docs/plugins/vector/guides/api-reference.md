# 📚 API Reference

**Prev:** [Usage Patterns](./usage-patterns.md)
**Next:** [Advanced](./advanced.md)
**Main:** [README](/plugins/vector/README.md) | **All guides:** [Index](/plugins/vector/README.md#-documentation-index)

> **In this guide:**
> - Complete plugin configuration
> - All resource methods and parameters
> - Static utility functions
> - Method aliases and comparison
> - Event types and payloads

**Time to read:** 15 minutes
**Difficulty:** Intermediate

---

## Quick Reference

| Component | Type | Purpose |
|-----------|------|---------|
| `new VectorPlugin({...})` | Constructor | Create plugin instance |
| `resource.vectorSearch()` | Method | Find k-nearest neighbors |
| `resource.vectorSearchPaged()` | Method | Paged search with scan stats |
| `resource.similarTo()` | Alias | Alternative name for vectorSearch |
| `resource.cluster()` | Method | K-means clustering |
| `resource.vectorDistance()` | Method | Calculate distance between vectors |
| `resource.distance()` | Alias | Alternative name for vectorDistance |
| `VectorPlugin.findOptimalK()` | Static | Analyze optimal cluster count |
| `VectorPlugin.normalize()` | Static | Normalize vector to unit length |
| `VectorPlugin.dotProduct()` | Static | Calculate dot product |

---

## Plugin Configuration

### Constructor

```javascript
new VectorPlugin({
  dimensions: 1536,            // Expected vector dimensions
  distanceMetric: 'cosine',    // Default: 'cosine', 'euclidean', 'manhattan'
  storageThreshold: 1500,      // Bytes - warn if vectors exceed this
  autoFixBehavior: false,      // Auto-set body-overflow when needed
  autoDetectVectorField: true, // Auto-detect embedding:XXX fields
  emitEvents: true,            // Emit events for monitoring
  verboseEvents: false,        // Emit detailed progress events
  eventThrottle: 100,          // Throttle progress events (ms)
  partitionPolicy: 'warn',     // 'allow' | 'warn' | 'error'
  maxUnpartitionedRecords: 1000,
  searchPageSize: 1000
})
```

### Configuration Options

| Option | Type | Default | Description | Range |
|--------|------|---------|-------------|-------|
| `dimensions` | number | `1536` | Expected vector dimensions (must match your embedding provider) | 1-unlimited |
| `distanceMetric` | string | `'cosine'` | Default distance metric: `'cosine'`, `'euclidean'`, or `'manhattan'` | See values |
| `storageThreshold` | number | `1500` | Warn if vectors exceed this size in bytes (S3 metadata limit: 2047) | 1-2047 |
| `autoFixBehavior` | boolean | `false` | Automatically set `body-overflow` behavior for large vectors | true/false |
| `autoDetectVectorField` | boolean | `true` | Automatically detect `embedding:XXX` fields in resources | true/false |
| `emitEvents` | boolean | `true` | Enable event emission for monitoring and debugging | true/false |
| `verboseEvents` | boolean | `false` | Emit detailed progress events (use for debugging, impacts performance) | true/false |
| `eventThrottle` | number | `100` | Throttle progress events in milliseconds (prevents spam) | 0-unlimited |
| `partitionPolicy` | string | `'warn'` | Unpartitioned scan policy: `'allow'`, `'warn'`, `'error'` | See values |
| `maxUnpartitionedRecords` | number | `1000` | Threshold for unpartitioned scans when policy is warn/error | 0-unlimited |
| `searchPageSize` | number | `1000` | Default page size for vector search scans | 1-unlimited |

### Default Configuration

```javascript
{
  dimensions: 1536,              // OpenAI text-embedding-3-small/large
  distanceMetric: 'cosine',      // Best for normalized embeddings
  storageThreshold: 1500,        // Warn if vectors exceed 1.5KB
  autoFixBehavior: false,        // Don't auto-change resource behavior
  autoDetectVectorField: true,   // Auto-detect embedding:XXX fields
  emitEvents: true,              // Enable event emission
  verboseEvents: false,          // Don't emit detailed progress
  eventThrottle: 100,            // Throttle progress events (ms)
  partitionPolicy: 'warn',       // Warn on large unpartitioned scans
  maxUnpartitionedRecords: 1000, // Threshold for unpartitioned scans
  searchPageSize: 1000           // Default scan page size
}
```

---

## Resource Methods

Added to all resources after plugin installation. All methods return promises.

### vectorSearch(queryVector, options)

Find K-nearest neighbors with optional partition filtering and distance threshold.

**Signature:**
```typescript
vectorSearch(
  queryVector: number[],
  options?: {
    vectorField?: string;
    limit?: number;
    distanceMetric?: string;
    threshold?: number;
    partition?: string;
    partitionValues?: Record<string, any>;
    pageSize?: number;
    maxScannedRecords?: number;
    partitionPolicy?: string;
    maxUnpartitionedRecords?: number;
    recordFilter?: (record: any) => boolean;
  }
): Promise<{ record: any; distance: number }[]>
```

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `queryVector` | number[] | required | Vector to search for (must match configured dimensions) |
| `options.vectorField` | string | auto-detected | Field containing vectors (auto-detected if `embedding:XXX` notation used) |
| `options.limit` | number | `10` | Maximum results to return |
| `options.distanceMetric` | string | plugin config | Distance function: `'cosine'`, `'euclidean'`, `'manhattan'` |
| `options.threshold` | number | unlimited | Only return distances ≤ threshold (optional filtering) |
| `options.partition` | string | auto | Partition name for filtered search (e.g., `'byCategory'`) |
| `options.partitionValues` | object | none | Partition field values to filter by (e.g., `{ category: 'electronics' }`) |
| `options.pageSize` | number | plugin config | Page size for scanning large datasets |
| `options.maxScannedRecords` | number | unlimited | Stop after scanning this many records (marks results as approximate) |
| `options.partitionPolicy` | string | plugin config | Override partition policy for this search |
| `options.maxUnpartitionedRecords` | number | plugin config | Override unpartitioned threshold for this search |
| `options.recordFilter` | function | none | In-process filter applied before distance calculation |

**Returns:** Array of objects sorted by distance (ascending):
```javascript
[
  { record: {...}, distance: 0.15 },
  { record: {...}, distance: 0.22 },
  { record: {...}, distance: 0.38 }
]
```

**Partition Behavior:**
- **No partition specified**: Auto-uses `byHasEmbedding` partition if available (searches only records with embeddings)
- **Custom partition specified**: Uses your partition for filtered search
- **Combined partition**: Can filter by multiple criteria

**Examples:**

```javascript
// Basic search - auto-detects vector field
const results = await products.vectorSearch([0.1, 0.2, ...], {
  limit: 10,
  distanceMetric: 'cosine'
});

// Search with threshold - only high-similarity results
const results = await products.vectorSearch([0.1, 0.2, ...], {
  limit: 10,
  threshold: 0.5
});

// Custom partition - search only within category
const results = await products.vectorSearch([0.1, 0.2, ...], {
  limit: 10,
  partition: 'byCategory',
  partitionValues: { category: 'sci-fi' }
});

// Explicit vector field
const results = await products.vectorSearch([0.1, 0.2, ...], {
  vectorField: 'embedding',
  limit: 10,
  distanceMetric: 'cosine'
});
```

---

### vectorSearchPaged(queryVector, options)

Paged vector search that returns results and scan statistics (bounded memory).

**Signature:**
```typescript
vectorSearchPaged(
  queryVector: number[],
  options?: {
    vectorField?: string;
    limit?: number;
    distanceMetric?: string;
    threshold?: number;
    partition?: string;
    partitionValues?: Record<string, any>;
    pageSize?: number;
    maxScannedRecords?: number;
    partitionPolicy?: string;
    maxUnpartitionedRecords?: number;
    recordFilter?: (record: any) => boolean;
  }
): Promise<{
  results: { record: any; distance: number }[];
  stats: {
    totalRecords: number | null;
    scannedRecords: number;
    processedRecords: number;
    pagesScanned: number;
    dimensionMismatches: number;
    durationMs: number;
    approximate: boolean;
  };
}>
```

**Example:**
```javascript
const { results, stats } = await products.vectorSearchPaged([0.1, 0.2, ...], {
  limit: 10,
  pageSize: 500,
  partition: 'byProject',
  partitionValues: { projectId }
});

console.log(`Scanned ${stats.scannedRecords} records in ${stats.durationMs}ms`);
```

---

### cluster(options)

Perform k-means clustering with optional partition filtering. Uses k-means++ initialization for better convergence.

**Signature:**
```typescript
cluster(options: {
  k: number;
  vectorField?: string;
  distanceMetric?: string;
  maxIterations?: number;
  tolerance?: number;
  partition?: string;
  partitionValues?: Record<string, any>;
}): Promise<{
  clusters: any[][];
  centroids: number[][];
  inertia: number;
  iterations: number;
  converged: boolean;
}>
```

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `k` | number | required | Number of clusters (1-n) |
| `vectorField` | string | auto-detected | Field containing vectors (auto-detected if `embedding:XXX` notation used) |
| `distanceMetric` | string | plugin config | Distance function: `'cosine'`, `'euclidean'`, `'manhattan'` |
| `maxIterations` | number | `100` | Maximum iterations before stopping |
| `tolerance` | number | `0.0001` | Convergence tolerance (stops if change < tolerance) |
| `partition` | string | auto | Partition name to cluster within |
| `partitionValues` | object | none | Partition field values to filter by |

**Returns:**

| Property | Type | Description |
|----------|------|-------------|
| `clusters` | array[] | Array of arrays - each inner array contains records in that cluster |
| `centroids` | number[][] | Cluster centers (one vector per cluster) |
| `inertia` | number | Sum of squared distances from points to centroids (lower = tighter clusters) |
| `iterations` | number | Number of iterations run (≤ maxIterations) |
| `converged` | boolean | Whether algorithm converged before maxIterations |

**Examples:**

```javascript
// Basic k-means with 5 clusters
const result = await products.cluster({
  k: 5,
  distanceMetric: 'euclidean',
  maxIterations: 100
});

// Access clusters
result.clusters.forEach((cluster, i) => {
  console.log(`Cluster ${i}: ${cluster.length} products`);
  cluster.forEach(product => console.log(`  - ${product.name}`));
});

// Custom partition - cluster only sci-fi books
const result = await books.cluster({
  k: 3,
  partition: 'byCategory',
  partitionValues: { category: 'sci-fi' }
});

// Analyze convergence
if (result.converged) {
  console.log(`Converged after ${result.iterations} iterations`);
} else {
  console.log(`Stopped at iteration limit with inertia ${result.inertia}`);
}
```

---

### vectorDistance(vector1, vector2, metric)

Calculate distance between two vectors using specified metric.

**Signature:**
```typescript
vectorDistance(
  vector1: number[],
  vector2: number[],
  metric?: string
): number
```

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `vector1` | number[] | required | First vector |
| `vector2` | number[] | required | Second vector (must same length as vector1) |
| `metric` | string | plugin config | Distance metric: `'cosine'`, `'euclidean'`, `'manhattan'` |

**Returns:** number (distance value, always ≥ 0)

**Examples:**

```javascript
const distance = products.vectorDistance(
  [1, 2, 3],
  [4, 5, 6],
  'euclidean'
);
console.log(`Distance: ${distance}`);

// Compare metrics
const cosineDistance = products.vectorDistance(vec1, vec2, 'cosine');
const euclideanDistance = products.vectorDistance(vec1, vec2, 'euclidean');
const manhattanDistance = products.vectorDistance(vec1, vec2, 'manhattan');
```

---

## Static Utilities

### VectorPlugin.findOptimalK(vectors, options)

Analyze optimal number of clusters using 5 evaluation metrics. Returns consensus recommendation.

**Signature:**
```typescript
static async findOptimalK(
  vectors: number[][],
  options?: {
    minK?: number;
    maxK?: number;
    distanceMetric?: string;
    nReferences?: number;
    stabilityRuns?: number;
  }
): Promise<{
  results: object[];
  recommendations: Record<string, number>;
  consensus: number;
  summary: object;
}>
```

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `vectors` | number[][] | required | Array of vectors to analyze |
| `options.minK` | number | `2` | Minimum K value to test |
| `options.maxK` | number | `sqrt(n/2)` | Maximum K value to test |
| `options.distanceMetric` | string | `'euclidean'` | Distance metric for evaluation |
| `options.nReferences` | number | `10` | Reference datasets for Gap Statistic |
| `options.stabilityRuns` | number | `5` | Runs for stability analysis |

**Returns:**

| Property | Type | Description |
|----------|------|-------------|
| `results` | object[] | Metrics for each K value tested |
| `recommendations` | object | Best K by each metric (silhouette, davies-bouldin, calinski-harabasz, gap, stability) |
| `consensus` | number | Recommended K (most voted across metrics) |
| `summary` | object | Analysis summary with confidence and metrics |

**Examples:**

```javascript
// Analyze vectors
const vectors = await products.list().then(items =>
  items.map(item => item.vector)
);

const analysis = await VectorPlugin.findOptimalK(vectors, {
  minK: 2,
  maxK: 10,
  distanceMetric: 'cosine'
});

console.log(`Best K: ${analysis.consensus}`);
console.log(`Recommendations:`, analysis.recommendations);
```

---

### VectorPlugin.normalize(vector)

Normalize vector to unit length (magnitude = 1).

**Signature:**
```typescript
static normalize(vector: number[]): number[]
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `vector` | number[] | Vector to normalize |

**Returns:** number[] (normalized vector with magnitude ≈ 1)

**Examples:**

```javascript
const normalized = VectorPlugin.normalize([3, 4]);
console.log(normalized);  // [0.6, 0.8]

const magnitude = Math.sqrt(0.6**2 + 0.8**2);
console.log(magnitude);   // 1.0

// Normalize before storing
const embedding = await openai.embeddings.create({...});
const normalized = VectorPlugin.normalize(embedding.data[0].embedding);
await products.insert({ name: 'Item', vector: normalized });
```

---

### VectorPlugin.dotProduct(vector1, vector2)

Calculate dot product (sum of element-wise products).

**Signature:**
```typescript
static dotProduct(vector1: number[], vector2: number[]): number
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `vector1` | number[] | First vector |
| `vector2` | number[] | Second vector (must same length) |

**Returns:** number (dot product)

**Examples:**

```javascript
const product = VectorPlugin.dotProduct([1, 2, 3], [4, 5, 6]);
console.log(product);  // 1*4 + 2*5 + 3*6 = 32

// Calculate similarity without distance function
const similarity = VectorPlugin.dotProduct(vec1, vec2) /
  (VectorPlugin.normalize(vec1).length * VectorPlugin.normalize(vec2).length);
```

---

## Method Aliases

For improved readability, VectorPlugin provides aliases for common operations:

### vectorSearch() Aliases

**`similarTo(queryVector, options)`** - Natural alternative
```javascript
// Intuitive: "find products similar to this"
const results = await products.similarTo(queryVector, { limit: 10 });
```

**`findSimilar(queryVector, options)`** - Descriptive alternative
```javascript
// Alternative natural name
const results = await products.findSimilar(queryVector, { limit: 10 });
```

### vectorDistance() Alias

**`distance(vector1, vector2, metric)`** - Simpler name
```javascript
// Shorter, simpler
const dist = products.distance([1, 2, 3], [4, 5, 6], 'euclidean');

// vs original
const dist = products.vectorDistance([1, 2, 3], [4, 5, 6], 'euclidean');
```

### Method Comparison

| Operation | Technical Name | Intuitive Alias | Best for |
|-----------|---------------|-----------------|----------|
| Find similar vectors | `vectorSearch()` | `similarTo()`, `findSimilar()` | Recommendations, search, discovery |
| Paged vector search | `vectorSearchPaged()` | - | Large datasets, monitoring |
| K-means clustering | `cluster()` | - | Grouping, segmentation, analysis |
| Calculate distance | `vectorDistance()` | `distance()` | Comparisons, metrics, similarity % |

**All methods are fully equivalent** - choose names that make your code most readable!

---

## Distance Metrics

### Cosine Distance

**Formula:** `1 - (dot(a, b) / (norm(a) * norm(b)))`

**Range:** 0 to 2
- 0 = identical direction
- 1 = perpendicular
- 2 = opposite direction

**Use when:**
- ✅ Vectors are normalized (default from most providers)
- ✅ Direction/angle matters, magnitude doesn't
- ✅ Text embeddings (OpenAI, Cohere, etc.)
- ✅ Recommendation systems

**Example:**
```javascript
const distance = products.vectorDistance(vec1, vec2, 'cosine');
// 0.15 = very similar
// 0.5 = somewhat similar
// 0.9 = not similar
```

### Euclidean Distance

**Formula:** `sqrt(sum((a[i] - b[i])^2))`

**Range:** 0 to ∞
- 0 = identical
- Larger values = more different

**Use when:**
- ✅ Magnitude matters
- ✅ Spatial/geometric data
- ✅ Unnormalized vectors
- ✅ Scientific/measurement data

**Example:**
```javascript
const distance = products.vectorDistance(vec1, vec2, 'euclidean');
// 0.5 = very close
// 2.0 = medium distance
// 5.0 = far apart
```

### Manhattan Distance

**Formula:** `sum(abs(a[i] - b[i]))`

**Range:** 0 to ∞
- 0 = identical
- Larger values = more different

**Use when:**
- ✅ High-dimensional sparse vectors
- ✅ Speed is critical
- ✅ Robust to outliers needed
- ✅ Discrete features

**Example:**
```javascript
const distance = products.vectorDistance(vec1, vec2, 'manhattan');
// 1.5 = very close
// 5.0 = medium distance
// 10.0 = far apart
```

---

## 📚 See Also

- **[Getting Started](./getting-started.md)** - Installation and setup
- **[Embedding Providers](./embedding-providers.md)** - 5 provider options
- **[Usage Patterns](./usage-patterns.md)** - Real-world examples
- **[Advanced](./advanced.md)** - Events, monitoring, performance
- **[Best Practices](./best-practices.md)** - Tips, troubleshooting, FAQ

---

**Ready to use the API?** Start with [Usage Patterns →](./usage-patterns.md) for real-world examples.
