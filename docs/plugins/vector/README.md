# 🧭 Vector Plugin

> **Lightweight vector store with compression, similarity search, and clustering.**
>
> **Navigation:** [Getting Started ↓](#-getting-started) | [Guides ↓](#-documentation-guides) | [Features ↓](#-key-features)

---

## ⚡ TLDR

**Store, search, and cluster** vector embeddings with **automatic compression** (77% savings), **multiple distance metrics**, and **intelligent K-means clustering**.

```javascript
import { Database, VectorPlugin } from 's3db';

const db = new Database('s3://key:secret@bucket');
const vectorPlugin = new VectorPlugin({ dimensions: 1536 });
await vectorPlugin.install(db);

// Create resource with clean embedding notation (auto-compression!)
const products = await db.createResource({
  name: 'products',
  attributes: {
    name: 'string|required',
    vector: 'embedding:1536'  // 77% compression built-in!
  }
});

// Store vectors (get from OpenAI, Anthropic, Cohere, etc.)
await products.insert({
  name: 'Laptop Pro',
  vector: [0.1, 0.2, ... ]  // 1536 dimensions
});

// Find similar items (KNN search)
const similar = await products.similarTo(queryVector, { limit: 5 });
console.log(`Found ${similar.length} similar items`);

// Auto-detect optimal clusters
const optimalK = await VectorPlugin.findOptimalK(vectors, { minK: 2, maxK: 10 });
console.log(`Optimal clusters: ${optimalK.consensus}`);
```

**Key Features:**
- ✅ **Clean syntax**: `embedding:1536` notation with auto-compression (77% savings)
- ✅ **Multiple distance metrics**: Cosine, Euclidean, Manhattan
- ✅ **KNN search**: Find k-nearest neighbors with configurable thresholds
- ✅ **K-means clustering**: K-means++ initialization for better convergence
- ✅ **Optimal K selection**: 5 evaluation metrics (Silhouette, Davies-Bouldin, Calinski-Harabasz, Gap, Stability)
- ✅ **Auto-validation**: Dimension checking and storage warnings
- ✅ **Events & Monitoring**: Progress tracking and comprehensive metrics

---

## 📦 Dependencies

**Required:**
```bash
pnpm install s3db.js
```

**NO Peer Dependencies!**

VectorPlugin is **built into s3db.js core** with zero external dependencies!

**Why Zero Dependencies?**

- ✅ Pure JavaScript implementation (no external libraries)
- ✅ Works instantly after installing s3db.js
- ✅ No version conflicts or compatibility issues
- ✅ Lightweight and fast (~15KB plugin code)
- ✅ Perfect for any environment (browser, Node.js, edge functions)

**What's Included:**

- **Distance Calculations**: Cosine, Euclidean, Manhattan metrics (pure JS)
- **K-means Clustering**: K-means++ initialization, iterative refinement
- **Optimal K Selection**: 5 evaluation metrics (Silhouette, Davies-Bouldin, Calinski-Harabasz, Gap Statistic, Stability)
- **KNN Search**: Brute-force nearest neighbor search with configurable thresholds
- **Vector Compression**: Fixed-point encoding for 77% space savings (built into s3db.js)
- **Event System**: Leverages s3db.js resource events for monitoring
- **Partition Support**: Automatic partition creation for optional embedding fields

**External Embedding Providers (Separate API Calls):**

VectorPlugin does NOT generate embeddings. You need external providers:

```bash
# Choose ONE embedding provider:

# OpenAI (1536D, high accuracy, $0.00002/1K tokens)
pnpm install openai

# Voyage AI (1024D, Anthropic partnership, $0.00012/1K tokens)
pnpm install voyageai

# Cohere (1024D, multilingual, $0.0001/1K tokens)
pnpm install cohere-ai

# Google Vertex AI (768D, enterprise, varies)
pnpm install @google-cloud/vertexai

# Open Source (384D, free, self-hosted)
# Use via HTTP API - no installation needed
```

See [**Embedding Providers Guide**](./guides/embedding-providers.md) for detailed provider comparison.

---

## 🚀 Getting Started

### Installation & Setup (3 minutes)

```javascript
import { Database, VectorPlugin } from 's3db';

const db = new Database('s3://key:secret@bucket');
const vectorPlugin = new VectorPlugin({ dimensions: 1536 });
await vectorPlugin.install(db);
await db.connect();

// Create resource with auto-compression
const products = await db.createResource({
  name: 'products',
  attributes: {
    id: 'string|required',
    name: 'string|required',
    vector: 'embedding:1536'  // Auto-compressed!
  }
});

// Use your embedding provider (OpenAI, etc.)
const embedding = await openai.embeddings.create({
  model: 'text-embedding-3-small',
  input: 'Gaming laptop'
});

// Store with vector
await products.insert({
  id: 'prod-1',
  name: 'Laptop Pro',
  vector: embedding.data[0].embedding
});

// Search!
const results = await products.similarTo(queryVector, { limit: 5 });
```

**Next Steps:**
1. See [**Getting Started Guide**](./guides/getting-started.md) for detailed setup
2. See [**Embedding Providers Guide**](./guides/embedding-providers.md) to choose a provider
3. See [**Usage Patterns Guide**](./guides/usage-patterns.md) for 5 real-world examples

---

## 📚 Documentation Guides

All documentation is organized into focused guides:

### 🎯 For First-Time Users
- **[Getting Started](./guides/getting-started.md)** (10 min)
  - Installation & setup
  - Configuration options
  - First example with explanation
  - Common mistakes to avoid

### 🔑 Choose Your Embedding Provider
- **[Embedding Providers](./guides/embedding-providers.md)** (15 min)
  - 5 major providers (OpenAI, Google, Cohere, Voyage AI, Open Source)
  - Cost and quality comparison
  - Model selection guide
  - Complete code examples for each

### 💡 Real-World Examples
- **[Usage Patterns](./guides/usage-patterns.md)** (25 min)
  - 5 complete working examples:
    1. Similarity Search (KNN)
    2. Clustering with Optimal K
    3. Product Recommendations
    4. Duplicate Detection
    5. User Segmentation
  - Copy-paste ready code
  - Progressive learning (Beginner → Advanced)

### 📖 Complete API Reference
- **[API Reference](./guides/api-reference.md)** (15 min)
  - Plugin configuration
  - All resource methods
  - Static utilities
  - Method aliases & comparison
  - Distance metrics reference

### 🚀 Advanced Topics
- **[Advanced Features](./guides/advanced.md)** (20 min)
  - Event system & monitoring
  - Production monitoring patterns
  - Performance optimization
  - Partition-based filtering
  - Caching strategies

### ✅ Best Practices
- **[Best Practices & FAQ](./guides/best-practices.md)** (30 min)
  - 5 essential best practices
  - Pro tips & tricks
  - Common mistakes with solutions
  - Error handling guide
  - 70+ FAQ entries

---

## 🎯 Key Features

### Automatic Compression

Use clean `embedding:XXX` notation for automatic 77% compression:

```javascript
attributes: {
  vector: 'embedding:1536'  // Auto-compressed from 12.3KB → 2.8KB
}
```

### Multiple Distance Metrics

Choose the right metric for your data:

```javascript
// Cosine (default) - Best for normalized embeddings
const results = await products.vectorSearch(queryVector, {
  distanceMetric: 'cosine'
});

// Euclidean - For spatial data
const results = await products.vectorSearch(queryVector, {
  distanceMetric: 'euclidean'
});

// Manhattan - For high-dimensional sparse data
const results = await products.vectorSearch(queryVector, {
  distanceMetric: 'manhattan'
});
```

### KNN Search with Partitions

Search with optional filtering for performance:

```javascript
// All vectors
const all = await products.vectorSearch(queryVector, { limit: 10 });

// Only specific category (10x faster!)
const filtered = await products.vectorSearch(queryVector, {
  limit: 10,
  partition: 'byCategory',
  partitionValues: { category: 'electronics' }
});
```

### K-Means Clustering

Group items automatically:

```javascript
// Find optimal K
const analysis = await VectorPlugin.findOptimalK(vectors, {
  minK: 2,
  maxK: 10
});

// Cluster with optimal K
const result = await products.cluster({
  k: analysis.consensus,
  distanceMetric: 'cosine'
});

console.log(`Created ${result.clusters.length} clusters`);
```

### Events & Monitoring

Track operations in real-time:

```javascript
vectorPlugin.on('plg:vector:search-complete', (data) => {
  console.log(`Search: ${data.resultsCount} results in ${data.duration}ms`);
});

vectorPlugin.on('plg:vector:cluster-complete', (data) => {
  console.log(`Cluster: k=${data.k}, converged=${data.converged}`);
});
```

See [Advanced Features](./guides/advanced.md) for complete monitoring guide.

---

## ⚡ Performance Comparison

| Records | VectorPlugin | Dedicated Vector DB | Use Case |
|---------|--------------|---------------------|----------|
| <10K | ~100-500ms | ~10-50ms | ✅ Perfect for VectorPlugin |
| 10K-100K | ~500ms-5s | ~50-200ms | ✅ Acceptable |
| 100K-1M | ~5-50s | ~200ms-1s | ⚠️ Consider dedicated DB |
| >1M | ~50s+ | ~1-5s | ❌ Use dedicated vector DB |

**When to use VectorPlugin:**
- ✅ Small to medium datasets (<100K vectors)
- ✅ Cost-sensitive (S3 is 10-100x cheaper than vector DBs)
- ✅ Infrequent searches
- ✅ Already using S3DB for other data

**When to use dedicated vector DB:**
- ⚠️ Large datasets (>100K vectors)
- ⚠️ Real-time low-latency searches (<100ms)
- ⚠️ High query volume (>100 queries/second)
- ⚠️ Need HNSW/IVF indexing

---

## 🛠️ Configuration

### Default Configuration

```javascript
new VectorPlugin({
  dimensions: 1536,              // OpenAI default
  distanceMetric: 'cosine',      // Best for normalized vectors
  storageThreshold: 1500,        // Warn if vectors exceed 1.5KB
  autoFixBehavior: false,        // Don't auto-change behavior
  autoDetectVectorField: true,   // Auto-detect embedding:XXX fields
  emitEvents: true,              // Enable monitoring
  verboseEvents: false,          // Set log level to silent logs in production
  eventThrottle: 100             // Throttle progress events (ms)
})
```

See [API Reference](./guides/api-reference.md) for all configuration options.

---

## ❓ Quick FAQ

**Q: Does VectorPlugin generate embeddings?**
A: No! It stores and searches pre-computed vectors. Use OpenAI, Cohere, Voyage AI, Google, or open-source models. See [Embedding Providers](./guides/embedding-providers.md).

**Q: What embedding provider should I use?**
A: Depends on your needs:
- **High accuracy**: OpenAI text-embedding-3-large
- **Cost-conscious**: OpenAI text-embedding-3-small
- **Anthropic users**: Voyage AI
- **Multilingual**: Cohere
- **Free/Self-hosted**: Sentence Transformers

See [Embedding Providers Guide](./guides/embedding-providers.md) for detailed comparison.

**Q: How do I handle large vectors (>2KB)?**
A: Use `embedding:XXX` notation for compression + `body-overflow` behavior:

```javascript
await db.createResource({
  name: 'products',
  attributes: { vector: 'embedding:3072' },
  behavior: 'body-overflow'
});
```

**Q: What's the best distance metric?**
A: **Cosine** for most cases (normalized embeddings). See [API Reference](./guides/api-reference.md) for metric comparison.

**Q: How do I speed up search for large datasets?**
A: Use partition-based filtering to reduce search space by 10x. See [Advanced Features](./guides/advanced.md).

**Q: Can I cache search results?**
A: Yes! Combine with CachePlugin for 100x faster repeated searches.

---

## 📖 Full Documentation Index

| Topic | Guide | Time |
|-------|-------|------|
| **Setup** | [Getting Started](./guides/getting-started.md) | 10 min |
| **Providers** | [Embedding Providers](./guides/embedding-providers.md) | 15 min |
| **Examples** | [Usage Patterns](./guides/usage-patterns.md) | 25 min |
| **API** | [API Reference](./guides/api-reference.md) | 15 min |
| **Advanced** | [Advanced Features](./guides/advanced.md) | 20 min |
| **Best Practices** | [Best Practices & FAQ](./guides/best-practices.md) | 30 min |

**Total Reading Time: ~115 minutes for complete understanding**

---

## 🔗 Related Documentation

- **[Cache Plugin](../cache.md)** - Speed up vector searches with caching
- **[Partitions](../../partitions.md)** - Organize vectors for faster filtering
- **[Behaviors](../../behaviors.md)** - Handle large vectors with body-overflow
- **[Hooks](../../hooks.md)** - Validate vectors before insert
- **[Events](../../events.md)** - Comprehensive event system

---

## 📝 Common Use Cases

### 1. Product Recommendations
Find similar products for "customers also viewed" sections.
See [Usage Patterns: Product Recommendations](./guides/usage-patterns.md#use-case-3-product-recommendations)

### 2. Duplicate Detection
Find and merge near-duplicate records.
See [Usage Patterns: Duplicate Detection](./guides/usage-patterns.md#use-case-4-duplicate-detection)

### 3. User Segmentation
Group users by behavior for targeted campaigns.
See [Usage Patterns: User Segmentation](./guides/usage-patterns.md#use-case-5-user-segmentation)

### 4. Semantic Search
Find semantically similar content.
See [Usage Patterns: Similarity Search](./guides/usage-patterns.md#use-case-1-similarity-search-knn)

### 5. Automatic Categorization
Group items into natural categories.
See [Usage Patterns: Clustering](./guides/usage-patterns.md#use-case-2-automatic-clustering-with-optimal-k)

---

## 🚀 Next Steps

1. **New to vectors?** Start with [Getting Started Guide](./guides/getting-started.md)
2. **Need an embedding provider?** See [Embedding Providers](./guides/embedding-providers.md)
3. **Want real-world examples?** Check [Usage Patterns](./guides/usage-patterns.md)
4. **Need API reference?** See [API Reference](./guides/api-reference.md)
5. **Going to production?** Read [Best Practices](./guides/best-practices.md)

---

**Questions?** Check [FAQ in Best Practices Guide](./guides/best-practices.md#-faq) for 70+ answers.
