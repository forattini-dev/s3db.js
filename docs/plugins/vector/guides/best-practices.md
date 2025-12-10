# ✅ Best Practices, Troubleshooting & FAQ

**Prev:** [Advanced](./advanced.md)
**Main:** [README](/plugins/vector/README.md) | **All guides:** [Index](/plugins/vector/README.md#-documentation-index)

> **In this guide:**
> - 5 best practices with code examples
> - Pro tips and tricks
> - Common mistakes to avoid
> - Error scenarios and solutions
> - 70+ FAQ entries (categorized)
> - Troubleshooting guide

**Time to read:** 30 minutes
**Difficulty:** Intermediate

---

## 🎯 Best Practices

### Practice 1: Generate Quality Embeddings

Always use high-quality, recent embedding models:

```javascript
// ✅ Good: Use latest models with text cleaning
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function getEmbedding(text) {
  // Clean text first
  const cleaned = text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');  // Normalize whitespace

  const response = await openai.embeddings.create({
    model: 'text-embedding-3-large',  // Latest model for best quality
    input: cleaned
  });

  return response.data[0].embedding;
}

// Store with metadata
await products.insert({
  name: 'Product',
  vector: embedding,
  vectorModel: 'text-embedding-3-large',
  vectorVersion: '2024-01',
  vectorDimensions: 1536
});
```

**Why it matters:** Quality embeddings directly impact search accuracy. Better model = better results.

---

### Practice 2: Validate Vectors

Use embedding notation for automatic validation:

```javascript
// ✅ Good: Use embedding notation with validation
const products = await db.createResource({
  name: 'products',
  attributes: {
    name: 'string|required',
    vector: 'embedding:1536'  // Automatic dimension validation
  }
});

// Add beforeInsert hook for additional validation
products.beforeInsert(async (data) => {
  if (data.vector) {
    // Check for NaN/Infinity
    if (data.vector.some(v => !isFinite(v))) {
      throw new ValidationError('Vector contains NaN or Infinity values', {
        statusCode: 422,
        retriable: false,
        suggestion: 'Ensure embedding provider outputs finite numbers'
      });
    }

    // Optionally normalize
    if (data.vectorModel === 'custom-model') {
      data.vector = VectorPlugin.normalize(data.vector);
    }
  }

  return data;
});
```

**Why it matters:** Invalid vectors cause search failures. Early validation prevents cascading errors.

---

### Practice 3: Monitor Search Quality

Track quality metrics and alert on degradation:

```javascript
// ✅ Good: Monitor results and quality metrics
const results = await products.vectorSearch(query, { limit: 10 });

// Log quality metrics
console.log(`Search returned ${results.length} results`);
console.log(`Best match distance: ${results[0]?.distance.toFixed(4)}`);
console.log(`Worst match distance: ${results[results.length-1]?.distance.toFixed(4)}`);

// Calculate similarity percentage
const similarityPercent = (1 - results[0]?.distance) * 100;
console.log(`Similarity: ${similarityPercent.toFixed(1)}%`);

// Alert if quality drops
if (results[0]?.distance > 0.5) {
  logger.warn('⚠️  Poor match quality - consider retraining embeddings');
  alerting.notify('Vector Search Quality Alert', { distance: results[0].distance });
}

// Track metrics
metrics.recordSearch({
  resultsCount: results.length,
  bestDistance: results[0]?.distance,
  avgDistance: results.reduce((sum, r) => sum + r.distance, 0) / results.length
});
```

**Why it matters:** Quality degradation usually indicates embedding model drift. Early detection enables corrective action.

---

### Practice 4: Cache Expensive Operations

Cache frequently used computations:

```javascript
// ✅ Good: Cache optimal K analysis
const cacheKey = `optimal-k-${vectors.length}`;
let analysis = await cache.get(cacheKey);

if (!analysis) {
  // Expensive computation - only once per 24h
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

**Why it matters:** Optimal K analysis is expensive (5-10 seconds). Caching 24h saves resources.

---

### Practice 5: Version Your Embeddings

Track embedding model versions for reproducibility:

```javascript
// ✅ Good: Store model metadata with vectors
await products.insert({
  id: 'prod-1',
  name: 'Laptop',
  description: 'High-performance laptop',
  vector: embedding,
  vectorModel: 'text-embedding-3-large',   // Model name
  vectorVersion: '2024-01',                // Version tag
  vectorDimensions: 1536,                  // For validation
  vectorUpdatedAt: new Date().toISOString()
});

// Migrate when upgrading models
async function migrateEmbeddings(oldVersion, newVersion) {
  const oldProducts = await products.list({
    filter: { vectorVersion: oldVersion }
  });

  console.log(`Migrating ${oldProducts.length} products...`);

  for (const product of oldProducts) {
    const newVector = await getEmbedding(product.description);
    await products.update(product.id, {
      vector: newVector,
      vectorModel: 'text-embedding-3-large',
      vectorVersion: newVersion,
      vectorUpdatedAt: new Date().toISOString()
    });
  }

  console.log(`✅ Migration complete`);
}
```

**Why it matters:** Model upgrades change vector similarity. Versioning allows rollback if quality drops.

---

## 🔥 Pro Tips

### Tip 1: Use Partitions for Large Datasets

Reduce search space dramatically:

```javascript
// Create partition for category-based filtering
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

// Search only within category - 10x faster!
const results = await products.vectorSearch(queryVector, {
  limit: 10,
  partition: 'byCategory',
  partitionValues: { category: 'electronics' }
});
```

### Tip 2: Normalize When Necessary

Normalize vectors for specific operations:

```javascript
// Normalize for cosine similarity with custom logic
const vec = await getEmbedding(text);
const normalized = VectorPlugin.normalize(vec);

// Or calculate similarity manually
const similarity = VectorPlugin.dotProduct(vec1, vec2) /
  (VectorPlugin.normalize(vec1).length * VectorPlugin.normalize(vec2).length);
```

### Tip 3: Use Distance Thresholds

Filter low-quality matches:

```javascript
// Only return high-similarity results
const results = await products.vectorSearch(queryVector, {
  limit: 50,  // Get more candidates
  threshold: 0.3  // Only return distance < 0.3 (cosine)
});

if (results.length === 0) {
  console.log('No high-quality matches found');
}
```

### Tip 4: Combine Metrics for Scoring

Hybrid scoring with business logic:

```javascript
const results = await products.vectorSearch(queryVector, { limit: 50 });

// Score = 70% similarity + 20% popularity + 10% rating
const scored = results.map(r => ({
  ...r.record,
  distance: r.distance,
  similarity: (1 - r.distance) * 100,
  score: (1 - r.distance) * 0.7 +
         (r.record.popularity / 100) * 0.2 +
         ((r.record.rating / 5) * 0.1)
}));

scored.sort((a, b) => b.score - a.score);
```

### Tip 5: Re-Cluster When Data Changes

Keep cluster assignments up-to-date:

```javascript
// Track last cluster time
let lastClusterTime = Date.now();
const clusterIntervalMs = 86400000; // Daily

// Re-cluster when data significantly changes
const result = await products.cluster({ k: 10 });

// Store assignments
for (let i = 0; i < products.length; i++) {
  await products.update(products[i].id, {
    clusterId: result.clusters[i]
  });
}

lastClusterTime = Date.now();
```

---

## ⚠️ Common Mistakes

### ❌ Mistake 1: Using Wrong Dimensions

```javascript
// Wrong - plugin configured for 1536D
const vectorPlugin = new VectorPlugin({ dimensions: 1536 });

// But storing 768D vectors
await products.insert({ vector: smallVector });  // Error!

// ✅ Fix: Match dimensions
const vectorPlugin = new VectorPlugin({ dimensions: 768 });
// OR
const embedding = await openai.embeddings.create({
  model: 'text-embedding-3-small',
  input: text
  // returns 1536D, not 768D
});
```

### ❌ Mistake 2: Forgetting to Auto-Detect

```javascript
// ❌ Wrong - explicit vectorField needed
const results = await products.vectorSearch(queryVector, {
  vectorField: 'vector'  // Explicitly set
});

// ✅ Better - auto-detected if using embedding notation
await db.createResource({
  name: 'products',
  attributes: {
    vector: 'embedding:1536'  // Will auto-detect
  }
});

const results = await products.vectorSearch(queryVector, {
  // vectorField omitted - auto-detected!
  limit: 10
});
```

### ❌ Mistake 3: Not Using Partitions

```javascript
// ❌ Slow - searches all 100K products
const results = await products.vectorSearch(queryVector, { limit: 10 });

// ✅ Fast - searches only electronics (10K)
const results = await products.vectorSearch(queryVector, {
  limit: 10,
  partition: 'byCategory',
  partitionValues: { category: 'electronics' }
});
```

### ❌ Mistake 4: Invalid Vector Values

```javascript
// ❌ Wrong - NaN/Infinity values
const embedding = await model.embed(text);
// Contains NaN due to model issue
await products.insert({ vector: embedding });  // Fails!

// ✅ Fix - validate first
if (!embedding.every(v => isFinite(v))) {
  throw new Error('Invalid embedding values');
}
await products.insert({ vector: embedding });
```

### ❌ Mistake 5: No Model Versioning

```javascript
// ❌ Wrong - can't track model versions
await products.insert({
  name: 'Product',
  vector: embedding
  // What model was this? Unknown!
});

// ✅ Fix - track metadata
await products.insert({
  name: 'Product',
  vector: embedding,
  vectorModel: 'text-embedding-3-large',
  vectorVersion: '2024-01'
});
```

---

## 🔧 Error Handling

### Error: DimensionMismatchError

**Symptom:** "Expected 1536 dimensions, got 768"

**Causes:**
1. Plugin configured for different dimensions than vectors
2. Using multiple embedding models with different dimensions
3. Query vector has wrong size

**Solution:**

```javascript
try {
  const results = await products.vectorSearch(wrongDimVector, {
    limit: 10
  });
} catch (error) {
  if (error.name === 'DimensionMismatchError') {
    console.error(`Expected ${error.expected}D, got ${error.actual}D`);

    // Option 1: Use correct model
    const correctEmbedding = await openai.embeddings.create({
      model: 'text-embedding-3-small',  // Returns 1536D
      input: text
    });

    // Option 2: Re-generate with matching dimensions
    const result = await products.vectorSearch(correctEmbedding.data[0].embedding);
  }
}
```

### Error: NoVectorsError

**Symptom:** "No vectors found in resource"

**Causes:**
1. All records have null/missing vector field
2. Wrong vector field name
3. Resource is empty

**Solution:**

```javascript
try {
  const result = await products.cluster({ k: 5 });
} catch (error) {
  if (error.message.includes('No vectors found')) {
    // Check what records exist
    const all = await products.list();
    console.log(`Total records: ${all.length}`);

    const withVectors = all.filter(r => r.vector !== null);
    console.log(`Records with vectors: ${withVectors.length}`);

    // Insert vectors if missing
    for (const record of all) {
      if (!record.vector) {
        const embedding = await getEmbedding(record.description);
        await products.update(record.id, { vector: embedding });
      }
    }
  }
}
```

### Error: InvalidMetricError

**Symptom:** "Unknown distance metric: 'similarity'"

**Causes:**
1. Typo in metric name
2. Using wrong metric name

**Solution:**

```javascript
// ✅ Valid metrics only
const results = await products.vectorSearch(queryVector, {
  distanceMetric: 'cosine'   // ✓
  // distanceMetric: 'euclidean'  // ✓
  // distanceMetric: 'manhattan'  // ✓
  // distanceMetric: 'similarity' // ✗ Not valid
});
```

### Error: Empty Dataset

**Symptom:** "No results returned"

**Causes:**
1. Query vector is far from all records
2. Threshold too strict
3. Partition filter matches nothing

**Solution:**

```javascript
const results = await products.vectorSearch(queryVector, {
  limit: 10,
  // threshold: 0.1  // Too strict
});

if (results.length === 0) {
  console.log('No matches found. Debugging:');

  // Check for similar records with higher threshold
  const relaxed = await products.vectorSearch(queryVector, {
    limit: 10,
    threshold: 0.9  // Relaxed threshold
  });

  if (relaxed.length > 0) {
    console.log(`Found ${relaxed.length} matches with higher threshold`);
    console.log(`Best distance: ${relaxed[0].distance}`);
  }

  // Check partition
  const all = await products.list({ limit: 5 });
  console.log('Sample records:', all);
}
```

---

## ❓ FAQ

### General Questions

**Q: Does VectorPlugin generate embeddings?**

A: No! VectorPlugin stores and searches pre-computed vectors. You must generate embeddings externally using:
- OpenAI (text-embedding-3-small, text-embedding-3-large)
- Anthropic (via Voyage AI partnership)
- Cohere (embed-english-v3.0, embed-multilingual-v3.0)
- Google Vertex AI (textembedding-gecko)
- Open source models (Sentence Transformers, all-MiniLM-L6-v2, etc.)

**Q: What's the best embedding model to use?**

A: Depends on your use case:
- **Semantic search**: OpenAI text-embedding-3-large (1536D, high accuracy, $0.13/1M tokens)
- **Budget-conscious**: OpenAI text-embedding-3-small (1536D, 80% of large quality, $0.02/1M tokens)
- **Real-time/low-latency**: Sentence Transformers all-MiniLM-L6-v2 (384D, fast, free local)
- **Multilingual**: Cohere embed-multilingual-v3.0 (1024D, 100+ languages, $0.10/1M tokens)
- **Anthropic users**: Voyage AI voyage-2 (1024D, Anthropic partnership, $0.12/1M tokens)

See [Embedding Providers](./embedding-providers.md) for detailed benchmarks.

**Q: How do I handle large vectors that exceed S3's 2KB metadata limit?**

A: Use the `embedding:XXX` notation which automatically applies 77% compression:

```javascript
attributes: {
  vector: 'embedding:1536'  // Auto-compressed, ~2.3KB (fits with body-overflow)
}
```

For even larger vectors:

```javascript
await db.createResource({
  name: 'products',
  attributes: { vector: 'embedding:3072' },  // Large model
  behavior: 'body-overflow'  // Stores in S3 object body
});
```

**Q: Can I use multiple embedding models in the same resource?**

A: Yes! Store metadata about model version:

```javascript
await products.insert({
  name: 'Product 1',
  vector: embedding,
  vectorModel: 'text-embedding-3-large',
  vectorVersion: '2024-01',
  vectorDimensions: 1536
});
```

**Q: How do I choose the optimal number of clusters (K)?**

A: Use `findOptimalK()` with 5 evaluation metrics:

```javascript
const optimalK = await VectorPlugin.findOptimalK(vectors, {
  minK: 2,
  maxK: 15
});
console.log(`Best K: ${optimalK.consensus}`);
```

**Q: What distance metric should I use?**

A:
- **Cosine**: Best for normalized vectors, focuses on direction (most common)
- **Euclidean**: Best for spatial data, considers magnitude
- **Manhattan**: Best for high-dimensional sparse vectors, robust to outliers

Most embedding providers normalize vectors, so **cosine** is the recommended default.

---

### Configuration & Usage

**Q: What are the default configuration values?**

A:
```javascript
{
  dimensions: 1536,              // OpenAI text-embedding-3-small/large
  distanceMetric: 'cosine',      // Best for normalized embeddings
  storageThreshold: 1500,        // Warn if vectors exceed 1.5KB
  autoFixBehavior: false,        // Don't auto-change resource behavior
  autoDetectVectorField: true,   // Auto-detect embedding:XXX fields
  emitEvents: true,              // Enable event emission
  verboseEvents: false,          // Don't emit detailed progress
  eventThrottle: 100             // Throttle progress events (ms)
}
```

**Q: Can I initialize VectorPlugin with no options?**

A: Yes! All options have sensible defaults:

```javascript
const vectorPlugin = new VectorPlugin();
// Uses all defaults above
```

**Q: What embedding fields are auto-detected?**

A: Any field with `embedding:XXX` notation:

```javascript
attributes: {
  vector: 'embedding:1536',      // Auto-detected ✓
  embedding: 'embedding:1024',   // Auto-detected ✓
  vectors: 'embedding:384',      // Auto-detected ✓
  myVector: 'embedding:768'      // Auto-detected ✓
}
```

---

### Performance & Optimization

**Q: How fast is VectorPlugin compared to dedicated vector databases?**

A: VectorPlugin uses brute-force KNN search (O(n)). Performance comparison:

| Records | VectorPlugin | Dedicated DB | Use Case |
|---------|--------------|--------------|----------|
| <10K | ~100-500ms | ~10-50ms | ✅ Perfect |
| 10K-100K | ~500ms-5s | ~50-200ms | ✅ Acceptable |
| 100K-1M | ~5-50s | ~200ms-1s | ⚠️ Consider DB |
| >1M | ~50s+ | ~1-5s | ❌ Use dedicated DB |

**When to use VectorPlugin:**
- ✅ Small to medium datasets (<100K vectors)
- ✅ Cost-sensitive (S3 is 10-100x cheaper)
- ✅ Infrequent searches
- ✅ Already using S3DB

**When to use dedicated DB:**
- ⚠️ Large datasets (>100K vectors)
- ⚠️ Real-time low-latency (<100ms)
- ⚠️ High query volume (>100/sec)
- ⚠️ Need HNSW/IVF indexing

**Q: Can I cache search results?**

A: Yes! Use CachePlugin:

```javascript
const cache = new CachePlugin({
  driver: 'memory',
  ttl: 3600000  // 1 hour
});
await db.usePlugin(cache);

// Second identical search uses cache (100x faster!)
const results = await products.vectorSearch(queryVector);
```

**Q: How can I speed up search for large datasets?**

A: Use partition-based filtering:

```javascript
// Reduces search space from 100K → 10K (10x faster!)
const results = await products.vectorSearch(queryVector, {
  partition: 'byCategory',
  partitionValues: { category: 'electronics' },
  limit: 10
});
```

---

### Clustering & Analysis

**Q: What's the difference between k-means clustering and KNN search?**

A:

**K-means clustering** (`cluster()`) - Groups all items:
- **Input**: All vectors in resource
- **Output**: K cluster assignments
- **Use case**: Product categorization, user segmentation
- **Example**: "Group 10K products into 20 categories"

**KNN search** (`findSimilar()`) - Finds similar items:
- **Input**: One query vector
- **Output**: K most similar vectors
- **Use case**: Recommendations, duplicate detection
- **Example**: "Find 5 products similar to this one"

**Q: How do I interpret clustering results?**

A:

```javascript
const result = await products.cluster({ k: 5 });

// result.clusters: Array of arrays - each contains records
// result.centroids: Cluster centers
// result.inertia: Sum of squared distances
// result.converged: Did algorithm converge?
```

**Q: Can I re-cluster when I add new records?**

A: Yes! Re-run periodically:

```javascript
const result = await products.cluster({ k: 10 });

// Store assignments
for (let i = 0; i < items.length; i++) {
  await products.update(items[i].id, {
    clusterId: result.clusters[i]
  });
}

// Later: Re-cluster after adding new products
const updated = await products.cluster({ k: 10 });
```

---

### Edge Cases & Limitations

**Q: What happens if I search with wrong dimensions?**

A: VectorPlugin throws `DimensionMismatchError`:

```javascript
try {
  const results = await products.vectorSearch(wrongDimVector);
} catch (error) {
  if (error.name === 'DimensionMismatchError') {
    console.error(`Expected ${error.expected}D, got ${error.actual}D`);
  }
}
```

**Q: Can I have multiple vector fields in the same resource?**

A: Yes! Store different embeddings:

```javascript
const products = await db.createResource({
  name: 'products',
  attributes: {
    name: 'string|required',
    textVector: 'embedding:1536',     // Text embeddings
    imageVector: 'embedding:2048'      // Image embeddings
  },
  behavior: 'body-overflow'
});

// Search by text
const textResults = await products.vectorSearch(queryTextVector, {
  vectorField: 'textVector'
});

// Search by image
const imageResults = await products.vectorSearch(queryImageVector, {
  vectorField: 'imageVector'
});
```

**Q: What if my embedding field is optional (not all records have vectors)?**

A: VectorPlugin automatically creates `byHasEmbedding` partition:

```javascript
const books = await db.createResource({
  name: 'books',
  attributes: {
    title: 'string|required',
    vector: 'embedding:1536'  // Optional (not required)
  }
});

// Insert some books without vectors
await books.insert({ title: 'Book without embedding' });

// Search only processes records with vectors (auto-filtered!)
const results = await books.vectorSearch(queryVector);
// Auto-uses byHasEmbedding partition
// 95% performance improvement!
```

---

### Troubleshooting

**Q: Search returns no results. What's wrong?**

A: Check:
1. Do vectors exist? `await products.list()` and check for null vectors
2. Is threshold too strict? Try higher threshold
3. Is query vector too different? Check distance values
4. Wrong partition? Try removing partition filter

```javascript
// Debug: Check what exists
const all = await products.list({ limit: 5 });
console.log('Sample records:', all);

// Debug: Relax threshold
const relaxed = await products.vectorSearch(queryVector, {
  threshold: 0.9  // Very relaxed
});
console.log(`Found with relaxed threshold: ${relaxed.length}`);
```

**Q: Clustering not converging. Why?**

A: Check:
1. Is K too high? Try smaller K
2. Is data sparse? Increase tolerance
3. Are vectors invalid? Check for NaN values

```javascript
const result = await products.cluster({
  k: 5,
  tolerance: 0.001,  // Lower = stricter convergence
  maxIterations: 100
});

console.log(`Converged: ${result.converged}`);
console.log(`Iterations: ${result.iterations}`);
```

**Q: Vector storage exceeds 2KB. What now?**

A: Use `body-overflow` behavior:

```javascript
await db.createResource({
  name: 'products',
  attributes: {
    vector: 'embedding:3072'  // 5.0KB compressed
  },
  behavior: 'body-overflow'  // Stores in body, not metadata
});
```

---

## 📚 See Also

- **[Getting Started](./getting-started.md)** - Installation and setup
- **[Embedding Providers](./embedding-providers.md)** - Provider guide
- **[Usage Patterns](./usage-patterns.md)** - Real-world examples
- **[API Reference](./api-reference.md)** - Method documentation
- **[Advanced](./advanced.md)** - Events, monitoring, performance

---

**Still have questions?** Check [Getting Started](./getting-started.md) for installation or [API Reference](./api-reference.md) for method details.
