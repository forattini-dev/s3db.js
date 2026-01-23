# 🚀 Getting Started with Vector Plugin

**Prev:** [README](/plugins/vector/README.md)
**Next:** [Embedding Providers](./embedding-providers.md)
**Main:** [README](/plugins/vector/README.md) | **All guides:** [Index](/plugins/vector/README.md#-documentation-index)

> **In this guide:**
> - Installation and setup
> - Configuration options
> - First vector operations
> - Choosing your embedding provider
> - Quick examples

**Time to read:** 10 minutes
**Difficulty:** Beginner

---

## Installation

### Step 1: Install s3db.js

VectorPlugin is built into s3db.js core. No external dependencies needed!

```bash
pnpm install s3db.js
```

### Step 2: Create Database & Plugin

```javascript
import { Database, VectorPlugin } from 's3db';

const db = new Database({
  connectionString: 's3://key:secret@bucket'
});

// Create plugin with full configuration
const vectorPlugin = new VectorPlugin({
  dimensions: 1536,            // Default embedding size (OpenAI models)
  distanceMetric: 'cosine',    // Default distance metric
  storageThreshold: 1500,      // Warn if vectors exceed 1.5KB (metadata limit)
  autoDetectVectorField: true, // Auto-detect embedding:XXX fields
  emitEvents: true,            // Enable monitoring events
  verboseEvents: false         // Set log level to silent logs in production
});

await vectorPlugin.install(db);
await db.connect();
```

### Step 3: Create Resource with Vector Field

Use the clean `embedding:XXX` notation for automatic compression:

```javascript
// Create resource with vector field
const products = await db.createResource({
  name: 'products',
  attributes: {
    id: 'string|required',
    name: 'string|required',
    description: 'string',

    // ✅ NEW: Clean embedding notation with auto-compression (77% savings!)
    vector: 'embedding:1536'  // OpenAI text-embedding-3-small/large
  }
});
```

**Why `embedding:1536` instead of arrays?**
- ✅ **Cleaner syntax** - One line instead of verbose type definitions
- ✅ **Automatic compression** - 77% space savings with fixed-point encoding
- ✅ **Auto-validation** - Dimension checking built-in
- ✅ **Performance optimized** - Faster storage and retrieval

### Step 4: Store Vectors

Get embeddings from your provider (OpenAI, Cohere, etc.) then store:

```javascript
// Get embedding from provider (e.g., OpenAI)
// const vector = await openai.embeddings.create({ ... });

// Store product with vector
await products.insert({
  id: 'prod-123',
  name: 'Laptop Pro',
  description: 'High-performance laptop',
  vector: [0.1, 0.2, 0.3, ... /* 1536 dimensions */]
});

// Store multiple products
await products.insertMany([
  { name: 'Phone', vector: [...] },
  { name: 'Tablet', vector: [...] },
  { name: 'Watch', vector: [...] }
]);
```

### Step 5: Use Vector Operations

```javascript
// Find similar products (KNN search)
const queryVector = [0.15, 0.25, ...]; // Your query embedding
const similar = await vectorPlugin.findSimilar(
  'products',
  'vector',
  queryVector,
  { k: 5 }  // Find top 5 similar products
);

console.log(`Found ${similar.length} similar products:`, similar);
```

---

## Configuration Options

### Plugin Configuration

```javascript
new VectorPlugin({
  // Embedding dimensions (default: 1536 for OpenAI)
  dimensions: 1536,

  // Distance metric: 'cosine' | 'euclidean' | 'manhattan'
  distanceMetric: 'cosine',

  // S3 metadata size warning threshold in bytes
  // VectorPlugin warns if compressed vector > this size
  // Default: 1500 (2KB metadata limit - 500B safety margin)
  storageThreshold: 1500,

  // Auto-detect embedding:XXX fields in resources
  // If true, plugin automatically finds and configures vector fields
  autoDetectVectorField: true,

  // Emit events for monitoring
  // plg:vector:search, plg:vector:cluster, plg:vector:error, etc.
  emitEvents: true,

  // Verbose event details (impacts performance, disable in production)
  verboseEvents: false,

  // Event throttling (ms) to avoid spam
  eventThrottleMs: 1000
});
```

### Resource Configuration

Configure vector field in resource attributes:

```javascript
await db.createResource({
  name: 'products',

  // Vector field with shorthand notation
  attributes: {
    vector: 'embedding:1536'  // 1536-D vectors, auto-compressed
  },

  // ⚠️ For large vectors (>1KB after compression)
  // Use body-overflow to store in S3 body instead of metadata
  behavior: 'body-overflow'
});
```

**Alternative notations:**

```javascript
// Standard OpenAI dimensions
attributes: {
  vector: 'embedding:1536'   // Text-embedding-3-large
  // or
  vector: 'embedding|length:1536'
}

// Sentence Transformers / BERT
attributes: {
  vector: 'embedding:384'    // Sentence-transformers/all-MiniLM-L6-v2
}

// Custom dimensions
attributes: {
  vector: 'embedding:2048'   // Your custom model
}
```

---

## Choosing an Embedding Provider

Three factors to consider:

### 1. **Dimensions**
- **1536**: OpenAI text-embedding-3-small/large (recommended)
- **1024**: Cohere, Voyage AI
- **384**: Sentence Transformers, open-source models
- **Custom**: Use any dimension your model produces

### 2. **Cost**
- **Free**: Open-source models (self-hosted)
- **Cheap**: OpenAI ($0.00002/1K tokens), Cohere
- **Expensive**: Enterprise models, real-time processing

### 3. **Quality vs Latency**
- **High accuracy**: OpenAI 3-large, Voyage AI
- **Balanced**: OpenAI 3-small, Cohere
- **Fast**: Sentence Transformers (local), open-source

**Quick decision tree:**
```
Start here: How do you want to generate embeddings?

├─ "I want the best quality" → OpenAI text-embedding-3-large (1536D)
├─ "Balance cost & quality" → OpenAI text-embedding-3-small (1536D)
├─ "I want to save money" → Cohere (1024D) or Voyage AI
├─ "I need fast local processing" → Sentence Transformers (384D)
└─ "I want full control" → Self-hosted open-source model
```

---

## First Example: Similarity Search

Complete working example:

```javascript
import { Database } from 's3db.js';
import { VectorPlugin } from 's3db.js';
import OpenAI from 'openai';

const db = new Database('s3://key:secret@bucket');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 1. Create plugin
const vectorPlugin = new VectorPlugin({ dimensions: 1536 });
await vectorPlugin.install(db);
await db.connect();

// 2. Create resource
const documents = await db.createResource({
  name: 'documents',
  attributes: {
    id: 'string|required',
    title: 'string|required',
    content: 'string|required',
    vector: 'embedding:1536'  // Auto-compressed vectors
  }
});

// 3. Generate embeddings and store
const docs = [
  { title: 'Python Guide', content: 'Python is a programming language...' },
  { title: 'JavaScript Tutorial', content: 'JavaScript powers web browsers...' },
  { title: 'Rust Basics', content: 'Rust is a systems programming language...' }
];

for (const doc of docs) {
  // Get embedding from OpenAI
  const embedding = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: doc.content
  });

  // Store with vector
  await documents.insert({
    id: `doc-${Date.now()}`,
    title: doc.title,
    content: doc.content,
    vector: embedding.data[0].embedding
  });
}

// 4. Search for similar documents
const queryText = 'Which language is best for system programming?';
const queryEmbedding = await openai.embeddings.create({
  model: 'text-embedding-3-small',
  input: queryText
});

// Find top 3 most similar documents
const similar = await vectorPlugin.findSimilar(
  'documents',
  'vector',
  queryEmbedding.data[0].embedding,
  { k: 3 }
);

console.log('Most relevant documents:');
similar.forEach(doc => {
  console.log(`- ${doc.title} (similarity: ${doc.similarity.toFixed(3)})`);
});
```

---

## Common Mistakes

### ❌ Mistake 1: Forgetting to install plugin

```javascript
// Wrong - plugin not installed
const vectorPlugin = new VectorPlugin({...});
// Plugin not ready!

// Correct
const vectorPlugin = new VectorPlugin({...});
await vectorPlugin.install(db);  // MUST install before use
```

---

### ❌ Mistake 2: Wrong dimensions

```javascript
// Wrong - dimensions don't match embeddings
new VectorPlugin({ dimensions: 768 });

// Store OpenAI embeddings (1536D)
await products.insert({ vector: [/* 1536 dimensions */] });
// Error: Dimension mismatch!

// Correct
new VectorPlugin({ dimensions: 1536 });  // Match your provider
```

---

### ❌ Mistake 3: Missing embedding provider setup

```javascript
// Wrong - no way to generate embeddings
const vectorPlugin = new VectorPlugin({...});
// How do I get embeddings?

// Correct - choose a provider
// Step 1: Get embeddings from OpenAI, Cohere, etc.
const embedding = await openai.embeddings.create({...});

// Step 2: Store in s3db
await products.insert({ vector: embedding });
```

---

## Distance Metrics

VectorPlugin supports 3 distance metrics. Choose based on your embeddings:

### Cosine Distance (Default, Recommended)
- **Best for**: Normalized embeddings (OpenAI, most modern models)
- **Range**: 0 to 2 (0 = identical, 2 = opposite)
- **Speed**: Fast
- **Use when**: Measuring angle between vectors, direction matters

```javascript
new VectorPlugin({ distanceMetric: 'cosine' })
```

### Euclidean Distance
- **Best for**: Unnormalized embeddings, magnitude matters
- **Range**: 0 to ∞ (0 = identical, larger = more different)
- **Speed**: Fast
- **Use when**: Measuring straight-line distance

```javascript
new VectorPlugin({ distanceMetric: 'euclidean' })
```

### Manhattan Distance
- **Best for**: Fast approximation, discrete features
- **Range**: 0 to ∞
- **Speed**: Fastest
- **Use when**: Need speed over precision

```javascript
new VectorPlugin({ distanceMetric: 'manhattan' })
```

**Which to choose?**
```
Cosine (default) ← Choose this 95% of the time
Euclidean ← If magnitude matters
Manhattan ← If speed is critical
```

---

## Storage & Compression

### Vector Storage Size (After Compression)

| Model | Dimensions | Raw Size | Compressed | Savings |
|-------|-----------|----------|-----------|---------|
| OpenAI text-embedding-3 | 1536 | 12.3 KB | 2.8 KB | 77% |
| BERT / Sentence Transformers | 384 | 3.1 KB | 0.7 KB | 77% |
| Small models | 128 | 1.0 KB | 0.23 KB | 77% |

**Storage behavior:**
- **< 2KB**: Fits in S3 metadata, very fast access
- **2KB - 500KB**: Uses `body-overflow`, still fast
- **> 500KB**: Needs optimization, consider chunking

---

## Next Steps

1. **[Choose your embedding provider →](./embedding-providers.md)**
   - Detailed guides for OpenAI, Cohere, Vertex AI, etc.
   - Cost and quality comparisons
   - Model selection guide

2. **[See usage patterns →](./usage-patterns.md)**
   - 5 real-world use cases
   - Similarity search, clustering, recommendations
   - Copy-paste ready code

3. **[API Reference →](./api-reference.md)**
   - Complete method documentation
   - All parameters and options

---

## 📚 See Also

- **[Embedding Providers](./embedding-providers.md)** - All 5 providers
- **[Usage Patterns](./usage-patterns.md)** - Real-world examples
- **[API Reference](./api-reference.md)** - Complete method docs
- **[Advanced](./advanced.md)** - Events, performance, monitoring

---

**Ready to start?** Choose your embedding provider and follow [Embedding Providers Guide →](./embedding-providers.md)
