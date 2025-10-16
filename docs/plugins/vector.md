# VectorPlugin

Store, search, and cluster vector embeddings with advanced similarity algorithms and automatic K-selection for optimal clustering.

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Core Concepts](#core-concepts)
- [Quick Start](#quick-start)
- [Embedding Providers](#embedding-providers)
  - [OpenAI](#openai-recommended)
  - [Google Vertex AI](#google-vertex-ai)
  - [Cohere](#cohere)
  - [Voyage AI (Anthropic)](#voyage-ai-anthropic-recommended)
  - [Model Comparison](#model-comparison-table)
  - [Choosing the Right Model](#choosing-the-right-model)
- [Use Cases](#use-cases)
  - [1. Similarity Search (KNN)](#1-similarity-search-knn)
  - [2. Automatic Clustering with Optimal K](#2-automatic-clustering-with-optimal-k)
  - [3. Product Recommendations](#3-product-recommendations)
  - [4. Duplicate Detection](#4-duplicate-detection)
  - [5. User Segmentation](#5-user-segmentation)
- [API Reference](#api-reference)
- [Events & Monitoring](#events--monitoring)
- [Performance Tips](#performance-tips)
- [Troubleshooting](#troubleshooting)

## Overview

VectorPlugin enables semantic search, clustering, and similarity analysis using vector embeddings in S3DB. It provides:

- **🎯 Embedding Shorthand Notation**: `embedding:1536` for clean, auto-optimized vector fields
- **🗜️ Automatic Compression**: 77% space savings with fixed-point encoding
- **📏 Multiple Distance Metrics**: Cosine, Euclidean, Manhattan
- **🎨 K-means Clustering**: With k-means++ initialization for better convergence
- **🎲 Optimal K Selection**: 5 evaluation metrics (Silhouette, Davies-Bouldin, Calinski-Harabasz, Gap Statistic, Stability)
- **🔍 KNN Search**: Find similar items with configurable thresholds
- **⚠️ Storage Validation**: Automatic warnings for vectors exceeding S3 metadata limits
- **✨ Auto-detect Vector Fields**: Automatically detects `embedding:XXX` fields (NEW!)
- **📊 Comprehensive Events**: Full observability with progress tracking and metrics (NEW!)
- **🎛️ Configurable Monitoring**: Verbose mode, event throttling, and performance metrics (NEW!)

### ✨ New: Embedding Shorthand Notation

Instead of verbose array definitions, use the clean `embedding:XXX` notation:

```javascript
// ✅ NEW: Clean shorthand with auto-compression (77% space savings)
attributes: {
  vector: 'embedding:1536'  // OpenAI text-embedding-3-small/3-large
}

// ✅ Alternative: Pipe notation
attributes: {
  vector: 'embedding|length:768'  // BERT/Sentence Transformers
}

// ❌ OLD: Verbose without compression
attributes: {
  vector: {
    type: 'array',
    items: 'number',
    length: 1536
  }
}
```

**Benefits**:
- 📝 **Cleaner syntax** - One line instead of five
- 🗜️ **Automatic compression** - 77% space savings with fixed-point encoding
- ✅ **Auto-validation** - Dimension checking built-in
- 🚀 **Performance** - Optimized storage and retrieval
- 📚 **Common dimensions** - 256, 384, 512, 768, 1024, 1536, 2048, 3072

### What VectorPlugin Does

✅ Store vectors efficiently
✅ Calculate distances between vectors
✅ Cluster vectors using k-means
✅ Find optimal number of clusters
✅ Search for similar vectors (KNN)
✅ Validate storage configuration

### What VectorPlugin Does NOT Do

❌ Generate embeddings (use OpenAI, Anthropic, Cohere, etc. externally)
❌ Process text (embeddings must be created before storage)
❌ Train models (only uses pre-computed vectors)

## Installation

```javascript
import { Database, VectorPlugin } from 's3db';

const db = new Database('s3://key:secret@bucket');

// Install plugin with full configuration
const vectorPlugin = new VectorPlugin({
  dimensions: 1536,            // Default embedding size (OpenAI text-embedding-3-small/3-large)
  distanceMetric: 'cosine',    // Default distance metric
  storageThreshold: 1500,      // Warn if vectors exceed 1.5KB
  autoFixBehavior: false,      // Auto-set body-overflow if needed
  autoDetectVectorField: true, // Auto-detect embedding:XXX fields (NEW!)
  emitEvents: true,            // Emit events for monitoring (NEW!)
  verboseEvents: false,        // Emit detailed progress events (NEW!)
  eventThrottle: 100           // Throttle progress events (ms) (NEW!)
});

await vectorPlugin.install(db);
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `dimensions` | number | `1536` | Expected vector dimensions |
| `distanceMetric` | string | `'cosine'` | Default distance metric (`'cosine'`, `'euclidean'`, `'manhattan'`) |
| `storageThreshold` | number | `1500` | Warn if vectors exceed this size (bytes) |
| `autoFixBehavior` | boolean | `false` | Automatically set `body-overflow` for large vectors |
| `autoDetectVectorField` | boolean | `true` | Automatically detect `embedding:XXX` fields |
| `emitEvents` | boolean | `true` | Enable event emission for monitoring |
| `verboseEvents` | boolean | `false` | Emit detailed progress events (use for debugging) |
| `eventThrottle` | number | `100` | Throttle progress events (milliseconds) |

### Storage Considerations

**⚠️ S3 Metadata Limit: 2KB (2047 bytes)**

Large vectors will exceed this limit:

| Model | Dimensions | Size (uncompressed) | Size (with `embedding:XXX`) | body-overflow? |
|-------|-----------|---------------------|----------------------------|----------------|
| OpenAI text-embedding-3-small/3-large | 1536 | ~10KB | **~2.3KB** (77% saved) | ✅ YES |
| Sentence Transformers | 384 | ~2.7KB | **~620 bytes** (77% saved) | ❌ NO |
| Small models | 128 | ~900 bytes | **~207 bytes** (77% saved) | ❌ NO |

> 💡 **Pro tip**: Using `embedding:XXX` notation automatically applies fixed-point encoding, saving ~77% space compared to raw float arrays!

**Solution**: Use `embedding:XXX` notation which automatically applies 77% compression with fixed-point encoding:

```javascript
const products = await db.createResource({
  name: 'products',
  attributes: {
    id: 'string|required',
    name: 'string|required',
    description: 'string',
    vector: 'embedding:1536'  // OpenAI text-embedding-3-small/3-large (auto-compressed)
  },
  behavior: 'body-overflow'  // ← Still recommended for large vectors
});
```

**Alternative notations**:
```javascript
// Pipe notation
vector: 'embedding|length:768'  // BERT/Sentence Transformers

// Traditional array notation (no auto-compression)
vector: {
  type: 'array',
  items: 'number',
  length: 1536
}
```

The plugin will **automatically warn** you if vectors are too large without proper behavior set.

## Core Concepts

### Distance Metrics

Choose the right metric for your use case:

| Metric | Best For | Range | Characteristics |
|--------|----------|-------|----------------|
| **Cosine** | Semantic similarity, text embeddings | [0, 2] | Direction-based, ignores magnitude |
| **Euclidean** | Geometric proximity, continuous data | [0, ∞) | Standard L2 distance |
| **Manhattan** | Grid-based, faster computation | [0, ∞) | L1 distance, sum of absolute differences |

```javascript
// Cosine - Best for text embeddings
const distance = products.vectorDistance(vector1, vector2, 'cosine');

// Euclidean - Standard geometric distance
const distance = products.vectorDistance(vector1, vector2, 'euclidean');

// Manhattan - Faster, good for high dimensions
const distance = products.vectorDistance(vector1, vector2, 'manhattan');
```

### K-means Clustering

Unsupervised learning algorithm that groups similar vectors into K clusters.

**Features**:
- k-means++ initialization (faster convergence than random)
- Multiple distance metrics supported
- Configurable max iterations and tolerance
- Returns cluster assignments, centroids, and inertia

### Optimal K Selection

Finding the right number of clusters is critical. VectorPlugin analyzes 5 metrics:

1. **Elbow Method** - Point of diminishing returns in inertia
2. **Silhouette Score** - How well-separated clusters are [-1, 1]
3. **Davies-Bouldin Index** - Ratio of intra/inter-cluster distances [0, ∞)
4. **Calinski-Harabasz Index** - Variance ratio [0, ∞)
5. **Gap Statistic** - Comparison to random distribution

The plugin provides a **consensus recommendation** based on all metrics.

## Quick Start

### Basic Setup

```javascript
import { Database, VectorPlugin } from 's3db';

// 1. Connect to database
const db = new Database('s3://key:secret@bucket');
await db.connect();

// 2. Install vector plugin
const vectorPlugin = new VectorPlugin({
  dimensions: 1536,
  distanceMetric: 'cosine'
});
await vectorPlugin.install(db);

// 3. Create resource with vectors (using shorthand notation)
const products = await db.createResource({
  name: 'products',
  attributes: {
    id: 'string|required',
    name: 'string|required',
    description: 'string',
    category: 'string',
    price: 'number',
    vector: 'embedding:1536'  // ✨ Auto-compression (77% space savings)
  },
  behavior: 'body-overflow'  // For large vectors
});

// 4. Insert data with vectors (generated externally)
await products.insert({
  id: 'prod-1',
  name: 'Gaming Laptop',
  description: 'High-performance laptop for gaming',
  category: 'Electronics',
  price: 1299.99,
  vector: [0.123, -0.456, 0.789, ...]  // 1536 dimensions from OpenAI text-embedding-3-small
});
```

## Embedding Providers

VectorPlugin works with embeddings from any provider. Below are examples for the most popular embedding models in 2025.

### OpenAI (Recommended)

**Models**:
- `text-embedding-3-small` - 1536 dims, best cost/performance ($0.00002/1k tokens)
- `text-embedding-3-large` - 1536 or 3072 dims, highest quality ($0.00013/1k tokens)

**Features**: Adjustable dimensions, multilingual, best-in-class performance

```javascript
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function getEmbedding(text, options = {}) {
  const response = await openai.embeddings.create({
    model: options.model || 'text-embedding-3-small',  // or 'text-embedding-3-large'
    input: text,
    dimensions: options.dimensions  // Optional: 256, 512, 1024, 1536 (default), or 3072
  });

  return response.data[0].embedding;
}

// Usage with S3DB
const products = await db.createResource({
  name: 'products',
  attributes: {
    id: 'string|required',
    name: 'string|required',
    description: 'string',
    vector: 'embedding:1536'  // OpenAI default dimension
  },
  behavior: 'body-overflow'
});

// Generate and store embeddings
const embedding = await getEmbedding('Gaming laptop with RGB keyboard');
await products.insert({
  id: 'prod-1',
  name: 'Gaming Laptop',
  description: 'High-performance laptop',
  vector: embedding,
  vectorModel: 'text-embedding-3-small',
  vectorDimensions: 1536
});
```

**Pro tip**: Use `text-embedding-3-large` with `dimensions: 1536` for 3072-quality embeddings in 1536 dimensions (best compression).

### Google Vertex AI

**Models**:
- `text-embedding-005` - 768 dims, optimized for English
- `text-multilingual-embedding-002` - 768 dims, 100+ languages
- `text-embedding-004` - 768 dims, previous generation
- `textembedding-gecko@003` - 768 dims, legacy
- **`gemini-embedding-001`** - 768/1536/3072 dims (recommended, adjustable)

**Features**: Matryoshka Representation Learning (MRL), flexible dimensions, multilingual

```javascript
import { VertexAI } from '@google-cloud/vertexai';

const vertexAI = new VertexAI({
  project: process.env.GOOGLE_CLOUD_PROJECT,
  location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1'
});

const model = vertexAI.preview.getGenerativeModel({
  model: 'gemini-embedding-001'  // Latest model
});

async function getEmbedding(text, dimensions = 768) {
  const result = await model.embedContent({
    content: [{ role: 'user', parts: [{ text }] }],
    outputDimensionality: dimensions  // 768, 1536, or 3072
  });

  return result.embedding.values;
}

// Usage with S3DB
const documents = await db.createResource({
  name: 'documents',
  attributes: {
    id: 'string|required',
    content: 'string|required',
    vector: 'embedding:768'  // Google default dimension
  },
  behavior: 'body-overflow'
});

// Generate and store embeddings
const embedding = await getEmbedding('Machine learning tutorial', 768);
await documents.insert({
  id: 'doc-1',
  content: 'Introduction to ML',
  vector: embedding,
  vectorModel: 'gemini-embedding-001',
  vectorDimensions: 768
});
```

**Dimension recommendations**:
- 768 dims: Best balance (default)
- 1536 dims: Higher quality, more storage
- 3072 dims: Maximum quality for critical applications

### Cohere

**Models**:
- `embed-english-v3.0` - 1024 dims, English only, best performance
- `embed-multilingual-v3.0` - 1024 dims, 100+ languages
- `embed-english-light-v3.0` - 384 dims, faster/smaller
- `embed-multilingual-light-v3.0` - 384 dims, 100+ languages
- `embed-english-image-v3.0` - 1024 dims, multimodal (text + images)
- `embed-multilingual-image-v3.0` - 1024 dims, multimodal + multilingual

**Features**: Multimodal support, compression-aware training, semantic search optimized

```javascript
import { CohereClient } from 'cohere-ai';

const cohere = new CohereClient({
  token: process.env.COHERE_API_KEY
});

async function getEmbedding(text, options = {}) {
  const response = await cohere.embed({
    texts: [text],
    model: options.model || 'embed-english-v3.0',
    inputType: options.inputType || 'search_document',  // or 'search_query', 'classification', 'clustering'
    embeddingTypes: ['float']
  });

  return response.embeddings.float[0];
}

// Usage with S3DB
const articles = await db.createResource({
  name: 'articles',
  attributes: {
    id: 'string|required',
    title: 'string|required',
    content: 'string',
    vector: 'embedding:1024'  // Cohere standard dimension
  },
  behavior: 'body-overflow'
});

// Generate embeddings with task-specific optimization
const embedding = await getEmbedding('AI research paper', {
  model: 'embed-english-v3.0',
  inputType: 'search_document'  // Optimized for document storage
});

await articles.insert({
  id: 'article-1',
  title: 'Deep Learning Advances',
  content: 'Latest AI research',
  vector: embedding,
  vectorModel: 'embed-english-v3.0',
  vectorDimensions: 1024
});

// For queries, use search_query input type
const queryEmbedding = await getEmbedding('machine learning tutorial', {
  inputType: 'search_query'  // Optimized for search queries
});
```

**Input Types**:
- `search_document`: For indexing documents (asymmetric search)
- `search_query`: For search queries (asymmetric search)
- `classification`: For classification tasks
- `clustering`: For clustering tasks

### Voyage AI (Anthropic Recommended)

**Models**:
- `voyage-3` - 1024 dims, best general-purpose
- `voyage-3-large` - 1024 dims, highest quality
- `voyage-code-3` - 1536 dims, code-specific
- `voyage-finance-2` - 1024 dims, finance domain
- `voyage-law-2` - 1024 dims, legal domain
- `voyage-multilingual-2` - 1024 dims, 100+ languages

**Features**: Domain-specific models, recommended by Anthropic for Claude RAG applications

**Note**: Anthropic does NOT offer native embedding models - they recommend Voyage AI

```javascript
import { VoyageAIClient } from 'voyageai';

const voyage = new VoyageAIClient({
  apiKey: process.env.VOYAGE_API_KEY
});

async function getEmbedding(text, model = 'voyage-3') {
  const response = await voyage.embed({
    input: [text],
    model: model,
    inputType: 'document'  // or 'query'
  });

  return response.data[0].embedding;
}

// Usage with S3DB
const knowledge = await db.createResource({
  name: 'knowledge_base',
  attributes: {
    id: 'string|required',
    content: 'string|required',
    vector: 'embedding:1024'  // Voyage standard dimension
  },
  behavior: 'body-overflow'
});

// Generate embeddings (optimized for Claude RAG)
const embedding = await getEmbedding(
  'Cloud computing infrastructure guide',
  'voyage-3'
);

await knowledge.insert({
  id: 'kb-1',
  content: 'Cloud computing guide',
  vector: embedding,
  vectorModel: 'voyage-3',
  vectorDimensions: 1024
});

// Domain-specific example (Finance)
const financeEmbedding = await getEmbedding(
  'Q4 earnings report analysis',
  'voyage-finance-2'  // Specialized for finance
});
```

**Use with Claude**:
```javascript
// Typical RAG pattern with Anthropic Claude
const query = 'What is cloud computing?';
const queryEmbedding = await getEmbedding(query, 'voyage-3');

// Search knowledge base
const results = await knowledge.vectorSearch(queryEmbedding, {
  limit: 5,
  distanceMetric: 'cosine'
});

// Use results as context for Claude
const context = results.map(r => r.record.content).join('\n\n');

const message = await anthropic.messages.create({
  model: 'claude-3-5-sonnet-20241022',
  messages: [{
    role: 'user',
    content: `Context:\n${context}\n\nQuestion: ${query}`
  }]
});
```

### Model Comparison Table

| Provider | Model | Dimensions | Use Case | Cost (per 1M tokens) | Notes |
|----------|-------|-----------|----------|---------------------|-------|
| **OpenAI** | text-embedding-3-small | 1536 | General purpose | $0.02 | Best cost/performance |
| **OpenAI** | text-embedding-3-large | 1536/3072 | High quality | $0.13 | Adjustable dimensions |
| **Google** | gemini-embedding-001 | 768-3072 | General purpose | Free* | Flexible dimensions (MRL) |
| **Google** | text-embedding-005 | 768 | English | Free* | Optimized for English |
| **Cohere** | embed-english-v3.0 | 1024 | English | $0.10 | Semantic search optimized |
| **Cohere** | embed-multilingual-v3.0 | 1024 | Multilingual | $0.10 | 100+ languages |
| **Cohere** | embed-english-light-v3.0 | 384 | Fast/small | $0.10 | Lower cost storage |
| **Voyage** | voyage-3 | 1024 | General purpose | $0.12 | Anthropic recommended |
| **Voyage** | voyage-3-large | 1024 | High quality | $0.12 | Best quality |
| **Voyage** | voyage-code-3 | 1536 | Code | $0.12 | Code-specific |
| **Voyage** | voyage-finance-2 | 1024 | Finance | $0.12 | Domain-specific |

*Google Vertex AI pricing varies by region and usage

### Storage Size Comparison

With S3DB's automatic compression (`embedding:XXX` notation):

| Dimensions | Uncompressed | With Compression (77% savings) | body-overflow Required? |
|-----------|--------------|-------------------------------|------------------------|
| 384 | ~2.7KB | **~620 bytes** | ❌ NO |
| 768 | ~5.4KB | **~1.2KB** | ❌ NO |
| 1024 | ~7.2KB | **~1.7KB** | ❌ NO |
| 1536 | ~10.8KB | **~2.5KB** | ✅ YES |
| 3072 | ~21.6KB | **~5.0KB** | ✅ YES |

### Choosing the Right Model

**For RAG Applications**:
- **Claude + Voyage AI**: Best quality, Anthropic-recommended
- **GPT + OpenAI**: Integrated ecosystem, adjustable dimensions
- **Gemini + Google**: Free tier, flexible dimensions

**For Semantic Search**:
- **Cohere**: Optimized input types (document vs query)
- **OpenAI 3-small**: Best cost/performance
- **Voyage-3**: High quality, domain-specific options

**For Multilingual**:
- **Cohere multilingual-v3.0**: 100+ languages
- **Google text-multilingual-embedding-002**: 100+ languages
- **Voyage multilingual-2**: 100+ languages

**For Code Search**:
- **Voyage code-3**: Code-specific (1536 dims)
- **OpenAI 3-small**: Good general-purpose code
- **Google gemini-embedding-001**: Multi-modal (code + text)

**For Cost Optimization**:
- **OpenAI 3-small**: $0.02 per 1M tokens (cheapest)
- **Cohere light models**: 384 dims, less storage
- **Google Vertex AI**: Free tier available

## Use Cases

### 1. Similarity Search (KNN)

**Scenario**: User searches for "gaming laptop", find 10 most similar products.

```javascript
// Step 1: Generate embedding for search query (external)
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function getEmbedding(text) {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',  // or 'text-embedding-3-large' for better quality
    input: text
  });
  return response.data[0].embedding;
}

// Step 2: Search for similar products
const searchQuery = 'gaming laptop';
const queryVector = await getEmbedding(searchQuery);

const results = await products.vectorSearch(queryVector, {
  limit: 10,
  distanceMetric: 'cosine',
  threshold: 0.5  // Optional: only return distance <= 0.5
});

// Step 3: Display results
console.log(`Found ${results.length} similar products:\n`);

results.forEach(({ record, distance }) => {
  console.log(`${record.name}`);
  console.log(`  Category: ${record.category}`);
  console.log(`  Price: $${record.price}`);
  console.log(`  Similarity: ${(1 - distance).toFixed(3)}`);
  console.log();
});
```

**Output**:
```
Found 10 similar products:

Gaming Laptop Pro
  Category: Electronics
  Price: $1499.99
  Similarity: 0.987

High-Performance Gaming Desktop
  Category: Electronics
  Price: $1899.99
  Similarity: 0.894

...
```

**Advanced: Filter by Category**

```javascript
// Search only within specific category
const results = await products.vectorSearch(queryVector, {
  limit: 10,
  distanceMetric: 'cosine',
  partition: 'byCategory',
  partitionValues: { category: 'Electronics' }
});
```

### 2. Automatic Clustering with Optimal K

**Scenario**: Group 1000 products into natural categories without manual labeling.

```javascript
// Step 1: Get all product vectors
const allProducts = await products.getAll();
const vectors = allProducts.map(p => p.vector);

console.log(`Analyzing ${vectors.length} products to find optimal K...\n`);

// Step 2: Find optimal number of clusters
const analysis = await VectorPlugin.findOptimalK(vectors, {
  minK: 2,
  maxK: 10,
  distanceMetric: 'cosine',
  nReferences: 10,      // For Gap Statistic
  stabilityRuns: 5      // For stability analysis
});

// Step 3: Review recommendations
console.log('📊 Optimal K Analysis Results:\n');
console.log(`Recommended K: ${analysis.consensus} (confidence: ${(analysis.summary.confidence * 100).toFixed(0)}%)\n`);

console.log('Metric Recommendations:');
console.log(`  Elbow Method:        K = ${analysis.recommendations.elbow}`);
console.log(`  Silhouette Score:    K = ${analysis.recommendations.silhouette}`);
console.log(`  Davies-Bouldin:      K = ${analysis.recommendations.daviesBouldin}`);
console.log(`  Calinski-Harabasz:   K = ${analysis.recommendations.calinskiHarabasz}`);
console.log(`  Gap Statistic:       K = ${analysis.recommendations.gap}`);
console.log(`  Stability:           K = ${analysis.recommendations.stability}\n`);

// Step 4: View detailed metrics for each K
console.log('Detailed Metrics:\n');
analysis.results.forEach(result => {
  console.log(`K = ${result.k}:`);
  console.log(`  Inertia:           ${result.inertia.toFixed(2)}`);
  console.log(`  Silhouette:        ${result.silhouette.toFixed(4)} (higher better)`);
  console.log(`  Davies-Bouldin:    ${result.daviesBouldin.toFixed(4)} (lower better)`);
  console.log(`  Calinski-Harabasz: ${result.calinskiHarabasz.toFixed(2)} (higher better)`);
  console.log(`  Gap:               ${result.gap.toFixed(4)} (higher better)`);
  console.log(`  Stability:         ${result.stability.toFixed(4)} (higher better)`);
  console.log();
});

// Step 5: Cluster with optimal K
const optimalK = analysis.consensus;
console.log(`\n🎯 Clustering with K = ${optimalK}...\n`);

const clustering = await products.cluster({
  k: optimalK,
  distanceMetric: 'cosine',
  maxIterations: 100
});

console.log('✅ Clustering Complete!\n');
console.log(`  Iterations:  ${clustering.iterations}`);
console.log(`  Converged:   ${clustering.converged}`);
console.log(`  Inertia:     ${clustering.inertia.toFixed(2)}\n`);

// Step 6: Analyze each cluster
clustering.clusters.forEach((cluster, i) => {
  console.log(`\nCluster ${i + 1} (${cluster.length} products):`);

  // Show top 5 products in cluster
  cluster.slice(0, 5).forEach(product => {
    console.log(`  - ${product.name} ($${product.price})`);
  });

  if (cluster.length > 5) {
    console.log(`  ... and ${cluster.length - 5} more`);
  }

  // Calculate average price in cluster
  const avgPrice = cluster.reduce((sum, p) => sum + p.price, 0) / cluster.length;
  console.log(`  Average Price: $${avgPrice.toFixed(2)}`);

  // Most common category
  const categories = cluster.map(p => p.category);
  const categoryCount = categories.reduce((acc, cat) => {
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});
  const topCategory = Object.entries(categoryCount).sort((a, b) => b[1] - a[1])[0];
  console.log(`  Primary Category: ${topCategory[0]} (${topCategory[1]} products)`);
});
```

**Output**:
```
📊 Optimal K Analysis Results:

Recommended K: 3 (confidence: 83%)

Metric Recommendations:
  Elbow Method:        K = 3
  Silhouette Score:    K = 3
  Davies-Bouldin:      K = 4
  Calinski-Harabasz:   K = 3
  Gap Statistic:       K = 3
  Stability:           K = 2

🎯 Clustering with K = 3...

✅ Clustering Complete!

  Iterations:  12
  Converged:   true
  Inertia:     1234.56

Cluster 1 (387 products):
  - Gaming Laptop Pro ($1499.99)
  - High-Performance Desktop ($1899.99)
  - Gaming Monitor 27" ($399.99)
  - Mechanical Keyboard RGB ($129.99)
  - Gaming Mouse ($79.99)
  ... and 382 more
  Average Price: $456.78
  Primary Category: Electronics (352 products)

Cluster 2 (421 products):
  - Office Desk Chair ($299.99)
  - Standing Desk ($449.99)
  ...
```

### 3. Product Recommendations

**Scenario**: User is viewing a product, show "Customers who viewed this also viewed...".

```javascript
// Step 1: Get current product
const currentProduct = await products.get('prod-123');

console.log(`User is viewing: ${currentProduct.name}\n`);

// Step 2: Find similar products
const recommendations = await products.vectorSearch(currentProduct.vector, {
  limit: 11,  // Get 11 to exclude current product
  distanceMetric: 'cosine'
});

// Step 3: Remove current product from results
const filtered = recommendations
  .filter(result => result.record.id !== currentProduct.id)
  .slice(0, 10);

// Step 4: Display recommendations
console.log('Customers who viewed this also viewed:\n');

filtered.forEach(({ record, distance }, index) => {
  const similarity = (1 - distance) * 100;
  console.log(`${index + 1}. ${record.name}`);
  console.log(`   Price: $${record.price}`);
  console.log(`   Match: ${similarity.toFixed(1)}%`);
  console.log();
});

// Step 5: Track recommendation performance (optional)
// Store which recommendations were clicked for future optimization
```

**Advanced: Category-Aware Recommendations**

```javascript
// Recommend similar products within same category
const recommendations = await products.vectorSearch(currentProduct.vector, {
  limit: 10,
  distanceMetric: 'cosine',
  partition: 'byCategory',
  partitionValues: { category: currentProduct.category }
});

// Or recommend complementary products from different category
const complementary = await products.vectorSearch(currentProduct.vector, {
  limit: 5,
  distanceMetric: 'cosine'
});

const differentCategory = complementary.filter(
  r => r.record.category !== currentProduct.category
);
```

**Hybrid Recommendations (Vector + Business Rules)**

```javascript
// Combine semantic similarity with business logic
const candidates = await products.vectorSearch(currentProduct.vector, {
  limit: 50,
  distanceMetric: 'cosine'
});

const recommendations = candidates
  // Filter by price range (±30%)
  .filter(r => {
    const priceDiff = Math.abs(r.record.price - currentProduct.price);
    return priceDiff <= currentProduct.price * 0.3;
  })
  // Filter by minimum rating
  .filter(r => r.record.rating >= 4.0)
  // Sort by combination of similarity and popularity
  .sort((a, b) => {
    const scoreA = (1 - a.distance) * 0.7 + (a.record.sales / 1000) * 0.3;
    const scoreB = (1 - b.distance) * 0.7 + (b.record.sales / 1000) * 0.3;
    return scoreB - scoreA;
  })
  .slice(0, 10);
```

### 4. Duplicate Detection

**Scenario**: Detect near-duplicate products in catalog to merge or remove.

```javascript
// Step 1: Define duplicate detection settings
const DUPLICATE_THRESHOLD = 0.05;  // Very similar (cosine distance < 0.05)

console.log('🔍 Scanning for duplicate products...\n');

// Step 2: Get all products
const allProducts = await products.getAll();

// Step 3: Find duplicates for each product
const duplicatePairs = [];
const processedIds = new Set();

for (const product of allProducts) {
  // Skip if already processed
  if (processedIds.has(product.id)) continue;

  // Find similar products
  const similar = await products.vectorSearch(product.vector, {
    limit: 10,
    distanceMetric: 'cosine',
    threshold: DUPLICATE_THRESHOLD
  });

  // Check for duplicates (excluding self)
  const duplicates = similar.filter(s => s.record.id !== product.id);

  if (duplicates.length > 0) {
    duplicatePairs.push({
      primary: product,
      duplicates: duplicates
    });

    // Mark all as processed
    processedIds.add(product.id);
    duplicates.forEach(d => processedIds.add(d.record.id));
  }
}

// Step 4: Report duplicates
console.log(`Found ${duplicatePairs.length} potential duplicate groups:\n`);

duplicatePairs.forEach((group, index) => {
  console.log(`\nGroup ${index + 1}:`);
  console.log(`  PRIMARY: ${group.primary.name} (ID: ${group.primary.id})`);
  console.log(`           ${group.primary.description.substring(0, 80)}...`);

  group.duplicates.forEach(({ record, distance }) => {
    const similarity = (1 - distance) * 100;
    console.log(`  DUPLICATE: ${record.name} (ID: ${record.id})`);
    console.log(`             ${record.description.substring(0, 80)}...`);
    console.log(`             Similarity: ${similarity.toFixed(2)}%`);
  });
});

// Step 5: Auto-merge or flag for review
for (const group of duplicatePairs) {
  const primary = group.primary;

  for (const { record: duplicate, distance } of group.duplicates) {
    if (distance < 0.01) {
      // Extremely similar - auto-merge
      console.log(`\n⚠️  Auto-merging ${duplicate.id} into ${primary.id}`);

      // Merge logic: keep primary, delete duplicate
      await products.delete(duplicate.id);

      // Optional: update primary with combined data
      await products.update(primary.id, {
        description: primary.description + ' ' + duplicate.description,
        // Merge other fields as needed
      });
    } else {
      // Somewhat similar - flag for manual review
      console.log(`\n🔎 Flagging ${duplicate.id} for manual review against ${primary.id}`);

      // Add to review queue
      await reviewQueue.insert({
        type: 'duplicate',
        primaryId: primary.id,
        duplicateId: duplicate.id,
        similarity: 1 - distance,
        status: 'pending'
      });
    }
  }
}
```

**Preventive Duplicate Detection (Before Insert)**

```javascript
// Add hook to check for duplicates before inserting
products.beforeInsert(async (data) => {
  // Generate embedding for new product
  const embedding = await getEmbedding(data.description);
  data.vector = embedding;

  // Check for existing similar products
  const similar = await products.vectorSearch(embedding, {
    limit: 1,
    distanceMetric: 'cosine',
    threshold: 0.05
  });

  if (similar.length > 0) {
    const existing = similar[0];
    throw new Error(
      `Potential duplicate detected! ` +
      `Similar to existing product "${existing.record.name}" ` +
      `(similarity: ${((1 - existing.distance) * 100).toFixed(1)}%)`
    );
  }

  return data;
});
```

### 5. User Segmentation

**Scenario**: Group users by browsing behavior to create targeted marketing campaigns.

```javascript
// Step 1: Create user behavior vectors
// Each dimension represents interaction with a product category/feature

const users = await db.createResource({
  name: 'users',
  attributes: {
    id: 'string|required',
    email: 'string|required',
    name: 'string',
    behaviorVector: 'embedding:10',  // Custom behavior dimensions (10 categories)
    segment: 'string'                // Will be filled by clustering
  },
  behavior: 'body-overflow'
});

await vectorPlugin.install(db);

// Step 2: Build behavior vectors (example with 10 categories)
async function buildBehaviorVector(userId) {
  // Get user's browsing history
  const history = await browsingHistory.list({
    filter: { userId }
  });

  // Count interactions per category (Electronics, Fashion, Home, etc.)
  const categories = [
    'Electronics', 'Fashion', 'Home', 'Sports',
    'Books', 'Toys', 'Food', 'Beauty', 'Health', 'Auto'
  ];

  const vector = categories.map(category => {
    const views = history.filter(h => h.category === category).length;
    const purchases = history.filter(h => h.category === category && h.purchased).length;

    // Weighted: purchases count more than views
    return views + (purchases * 5);
  });

  // Normalize vector
  return VectorPlugin.normalize(vector);
}

// Step 3: Generate vectors for all users
console.log('Building behavior vectors for all users...\n');

const allUsers = await users.getAll();

for (const user of allUsers) {
  const behaviorVector = await buildBehaviorVector(user.id);
  await users.update(user.id, { behaviorVector });
}

// Step 4: Find optimal number of segments
console.log('Finding optimal number of user segments...\n');

const userVectors = allUsers.map(u => u.behaviorVector);

const segmentAnalysis = await VectorPlugin.findOptimalK(userVectors, {
  minK: 3,
  maxK: 8,
  distanceMetric: 'euclidean',  // Better for behavioral data
  nReferences: 10,
  stabilityRuns: 5
});

console.log(`Recommended segments: ${segmentAnalysis.consensus}\n`);

// Step 5: Cluster users into segments
const clustering = await users.cluster({
  k: segmentAnalysis.consensus,
  vectorField: 'behaviorVector',
  distanceMetric: 'euclidean'
});

// Step 6: Analyze and name each segment
const segmentNames = [
  'Tech Enthusiasts',
  'Fashion Lovers',
  'Home Improvers',
  'Sports Fans',
  'Bookworms'
];

clustering.clusters.forEach(async (cluster, i) => {
  const segmentName = segmentNames[i] || `Segment ${i + 1}`;

  console.log(`\n${segmentName} (${cluster.length} users):`);

  // Update users with segment name
  for (const user of cluster) {
    await users.update(user.id, { segment: segmentName });
  }

  // Analyze segment characteristics
  const avgVector = clustering.centroids[i];
  const categories = [
    'Electronics', 'Fashion', 'Home', 'Sports',
    'Books', 'Toys', 'Food', 'Beauty', 'Health', 'Auto'
  ];

  // Find top 3 categories for this segment
  const topCategories = avgVector
    .map((value, index) => ({ category: categories[index], score: value }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  console.log('  Top interests:');
  topCategories.forEach(({ category, score }) => {
    console.log(`    - ${category}: ${(score * 100).toFixed(1)}%`);
  });

  // Sample users
  console.log('  Sample users:');
  cluster.slice(0, 3).forEach(user => {
    console.log(`    - ${user.name} (${user.email})`);
  });
});

// Step 7: Create targeted campaigns
console.log('\n\n📧 Creating targeted email campaigns...\n');

const campaigns = {
  'Tech Enthusiasts': {
    subject: '🚀 New Tech Arrivals - Exclusive Early Access',
    products: 'electronics',
    discount: '15%'
  },
  'Fashion Lovers': {
    subject: '👗 Spring Collection Now Live - 20% Off',
    products: 'fashion',
    discount: '20%'
  },
  'Home Improvers': {
    subject: '🏠 Transform Your Space - Home Essentials Sale',
    products: 'home',
    discount: '25%'
  }
};

for (const [segment, campaign] of Object.entries(campaigns)) {
  const segmentUsers = await users.list({
    filter: { segment }
  });

  console.log(`Sending "${campaign.subject}" to ${segmentUsers.length} ${segment}`);

  // Send emails (pseudo-code)
  // await sendCampaignEmail(segmentUsers, campaign);
}
```

**Output**:
```
Finding optimal number of user segments...

Recommended segments: 5

Tech Enthusiasts (2,341 users):
  Top interests:
    - Electronics: 87.3%
    - Sports: 45.2%
    - Auto: 32.1%
  Sample users:
    - John Doe (john@example.com)
    - Jane Smith (jane@example.com)
    - Bob Wilson (bob@example.com)

Fashion Lovers (1,892 users):
  Top interests:
    - Fashion: 91.5%
    - Beauty: 78.4%
    - Home: 34.7%
  ...

📧 Creating targeted email campaigns...

Sending "🚀 New Tech Arrivals" to 2,341 Tech Enthusiasts
Sending "👗 Spring Collection" to 1,892 Fashion Lovers
Sending "🏠 Transform Your Space" to 1,567 Home Improvers
```

## API Reference

### Plugin Configuration

```javascript
new VectorPlugin({
  dimensions: 1536,            // Expected vector dimensions
  distanceMetric: 'cosine',    // Default: 'cosine', 'euclidean', 'manhattan'
  storageThreshold: 1500,      // Bytes - warn if vectors exceed this
  autoFixBehavior: false,      // Auto-set body-overflow when needed
  autoDetectVectorField: true, // Auto-detect embedding:XXX fields
  emitEvents: true,            // Emit events for monitoring
  verboseEvents: false,        // Emit detailed progress events
  eventThrottle: 100           // Throttle progress events (ms)
})
```

**Configuration Options**:
- `dimensions` (number): Expected vector dimensions (default: `1536`)
- `distanceMetric` (string): Default distance metric - `'cosine'`, `'euclidean'`, or `'manhattan'` (default: `'cosine'`)
- `storageThreshold` (number): Warn if vectors exceed this size in bytes (default: `1500`)
- `autoFixBehavior` (boolean): Automatically set `body-overflow` for large vectors (default: `false`)
- `autoDetectVectorField` (boolean): Automatically detect `embedding:XXX` fields (default: `true`)
- `emitEvents` (boolean): Enable event emission for monitoring (default: `true`)
- `verboseEvents` (boolean): Emit detailed progress events - use for debugging (default: `false`)
- `eventThrottle` (number): Throttle progress events in milliseconds (default: `100`)

### Resource Methods

Added to all resources after plugin installation:

#### `vectorSearch(queryVector, options)`

Find K-nearest neighbors.

**Parameters**:
- `queryVector` (number[]): Vector to search for
- `options` (object):
  - `vectorField` (string): Field containing vectors (optional - auto-detected if `embedding:XXX` notation used, default: `'vector'`)
  - `limit` (number): Max results to return (default: `10`)
  - `distanceMetric` (string): Distance function (default: plugin config)
  - `threshold` (number): Only return distances <= threshold (optional)
  - `partition` (string): Partition name for filtered search (optional)
  - `partitionValues` (object): Partition values (optional)

**Returns**: Array of `{ record, distance }` sorted by distance (ascending)

```javascript
// With auto-detect (recommended when using embedding:XXX notation)
const results = await resource.vectorSearch([0.1, 0.2, ...], {
  limit: 10,
  distanceMetric: 'cosine',
  threshold: 0.5
});

// Or specify explicitly
const results = await resource.vectorSearch([0.1, 0.2, ...], {
  vectorField: 'embedding',
  limit: 10,
  distanceMetric: 'cosine'
});
```

#### `cluster(options)`

Perform k-means clustering.

**Parameters**:
- `options` (object):
  - `k` (number): Number of clusters (required)
  - `vectorField` (string): Field containing vectors (optional - auto-detected if `embedding:XXX` notation used, default: `'vector'`)
  - `distanceMetric` (string): Distance function (default: plugin config)
  - `maxIterations` (number): Max iterations (default: `100`)
  - `tolerance` (number): Convergence tolerance (default: `0.0001`)
  - `partition` (string): Cluster within partition (optional)

**Returns**: Object with:
- `clusters` (array[]): Array of cluster arrays (records)
- `centroids` (number[][]): Cluster centers
- `inertia` (number): Sum of squared distances to centroids
- `iterations` (number): Number of iterations run
- `converged` (boolean): Whether algorithm converged

```javascript
// With auto-detect (recommended when using embedding:XXX notation)
const result = await resource.cluster({
  k: 5,
  distanceMetric: 'euclidean',
  maxIterations: 100
});

// Or specify explicitly
const result = await resource.cluster({
  k: 5,
  vectorField: 'embedding',
  distanceMetric: 'euclidean',
  maxIterations: 100
});
```

#### `vectorDistance(vector1, vector2, metric)`

Calculate distance between two vectors.

**Parameters**:
- `vector1` (number[]): First vector
- `vector2` (number[]): Second vector
- `metric` (string): Distance metric (default: plugin config)

**Returns**: number (distance)

```javascript
const distance = resource.vectorDistance(
  [1, 2, 3],
  [4, 5, 6],
  'euclidean'
);
```

### Static Utilities

#### `VectorPlugin.findOptimalK(vectors, options)`

Analyze optimal number of clusters using 5 metrics.

**Parameters**:
- `vectors` (number[][]): Array of vectors to analyze
- `options` (object):
  - `minK` (number): Minimum K to test (default: `2`)
  - `maxK` (number): Maximum K to test (default: `sqrt(n/2)`)
  - `distanceFn` (function): Distance function (default: euclidean)
  - `nReferences` (number): Reference datasets for Gap Statistic (default: `10`)
  - `stabilityRuns` (number): Runs for stability analysis (default: `5`)

**Returns**: Promise<object> with:
- `results` (array): Metrics for each K value
- `recommendations` (object): Best K by each metric
- `consensus` (number): Recommended K (most votes)
- `summary` (object): Analysis summary

```javascript
const analysis = await VectorPlugin.findOptimalK(vectors, {
  minK: 2,
  maxK: 10,
  distanceMetric: 'cosine'
});

console.log(`Best K: ${analysis.consensus}`);
```

#### `VectorPlugin.normalize(vector)`

Normalize vector to unit length.

```javascript
const normalized = VectorPlugin.normalize([3, 4]);
// Returns: [0.6, 0.8]
```

#### `VectorPlugin.dotProduct(vector1, vector2)`

Calculate dot product.

```javascript
const product = VectorPlugin.dotProduct([1, 2, 3], [4, 5, 6]);
// Returns: 32
```


### 🎯 Intuitive Method Aliases

For better developer experience, VectorPlugin provides intuitive aliases for common operations:

#### `similarTo(queryVector, options)` & `findSimilar(queryVector, options)`

Natural alternatives to `vectorSearch()` - both aliases point to the same method.

```javascript
// ✨ More intuitive: "find products similar to this query"
const results = await products.similarTo(queryVector, {
  limit: 10,
  distanceMetric: 'cosine'
});

// ✨ Alternative:  descriptive name
const results = await products.findSimilar(queryVector, {
  limit: 10
});

// Original (still works):
const results = await products.vectorSearch(queryVector, { limit: 10 });
```

**When to use**:
- `similarTo()` - Best for general similarity search ("products similar to X")
- `findSimilar()` - Alternative descriptive name
- `vectorSearch()` - When you want to emphasize the technical aspect

#### `distance(vector1, vector2, metric)`

Simpler alternative to `vectorDistance()`.

```javascript
// ✨ Simpler
const dist = products.distance([1, 2, 3], [4, 5, 6], 'euclidean');

// Original (still works):
const dist = products.vectorDistance([1, 2, 3], [4, 5, 6], 'euclidean');
```

### Method Comparison

| Operation | Technical Name | Intuitive Alias | Use Case |
|-----------|---------------|-----------------|----------|
| Search similar vectors | `vectorSearch()` | `similarTo()`, `findSimilar()` | Recommendations, search |
| K-means clustering | `cluster()` | - | Grouping, segmentation |
| Calculate distance | `vectorDistance()` | `distance()` | Comparisons, metrics |

**All methods are fully equivalent** - aliases simply point to the same underlying implementation. Choose the name that makes your code most readable!

```javascript
// Example: Product recommendations with intuitive API
const current = await products.get('laptop-123');

// Natural language-like API
const recommendations = await products.similarTo(current.vector, {
  limit: 5
});

// Calculate similarity percentage  
for (const { record, distance } of recommendations) {
  const dist = products.distance(current.vector, record.vector, 'cosine');
  console.log(`${record.name}: ${((1 - dist) * 100).toFixed(1)}% similar`);
}
```
## Events & Monitoring

VectorPlugin emits comprehensive events for monitoring, debugging, and observability. All events can be disabled by setting `emitEvents: false` in the plugin configuration.

### Event Categories

#### 🔄 Lifecycle Events

Already emitted by base Plugin class:

| Event | When | Payload |
|-------|------|---------|
| `installed` | Plugin installed | `{ plugin: 'VectorPlugin' }` |
| `started` | Plugin started | `{ plugin: 'VectorPlugin' }` |
| `stopped` | Plugin stopped | `{ plugin: 'VectorPlugin' }` |
| `uninstalled` | Plugin uninstalled | `{ plugin: 'VectorPlugin' }` |

#### 🔍 Search Events

| Event | When | Payload |
|-------|------|---------|
| `vector:search-start` | Search initiated | `{ resource, vectorField, limit, distanceMetric, partition, threshold, queryDimensions, timestamp }` |
| `vector:search-progress` | Search progress (throttled, verbose mode only) | `{ resource, processed, total, progress, timestamp }` |
| `vector:search-complete` | Search completed | `{ resource, vectorField, resultsCount, totalRecords, processedRecords, dimensionMismatches, duration, throughput, timestamp }` |
| `vector:search-error` | Search error | `{ resource, error, stack, timestamp }` |

#### 🎯 Clustering Events

| Event | When | Payload |
|-------|------|---------|
| `vector:cluster-start` | Clustering initiated | `{ resource, vectorField, k, distanceMetric, partition, maxIterations, timestamp }` |
| `vector:cluster-iteration` | Each k-means iteration (throttled, verbose mode only) | `{ resource, k, iteration, inertia, converged, timestamp }` |
| `vector:cluster-converged` | Clustering converged | `{ resource, k, iterations, inertia, timestamp }` |
| `vector:cluster-complete` | Clustering completed | `{ resource, vectorField, k, vectorCount, iterations, converged, inertia, clusterSizes, duration, timestamp }` |
| `vector:cluster-error` | Clustering error | `{ resource, error, stack, timestamp }` |

#### ⚙️ Configuration & Validation Events

| Event | When | Payload |
|-------|------|---------|
| `vector:field-detected` | Auto-detected embedding field | `{ resource, vectorField, timestamp }` |
| `vector:storage-warning` | Large vectors without proper behavior | `{ resource, vectorFields, totalEstimatedBytes, metadataLimit, currentBehavior, recommendation }` |
| `vector:behavior-fixed` | Auto-fixed behavior | `{ resource, newBehavior }` |
| `vector:dimension-mismatch` | Dimension mismatch detected (verbose mode only) | `{ resource, recordIndex, expected, got, timestamp }` |
| `vector:empty-dataset` | No vectors found | `{ resource, vectorField, totalRecords, timestamp }` |
| `vector:partition-filter` | Partition filter applied | `{ resource, partition, timestamp }` |

#### 📊 Performance Events

| Event | When | Payload |
|-------|------|---------|
| `vector:performance` | After operations (verbose mode only) | `{ operation, resource, duration, throughput, recordsPerSecond, timestamp }` |

### Usage Examples

#### Basic Monitoring

```javascript
// Monitor all search operations
vectorPlugin.on('vector:search-start', (data) => {
  console.log(`🔍 Starting search on ${data.resource}...`);
  console.log(`   Query dimensions: ${data.queryDimensions}`);
  console.log(`   Distance metric: ${data.distanceMetric}`);
  console.log(`   Limit: ${data.limit}`);
});

vectorPlugin.on('vector:search-complete', (data) => {
  console.log(`✅ Search completed in ${data.duration}ms`);
  console.log(`   Found: ${data.resultsCount} results`);
  console.log(`   Throughput: ${data.throughput} records/s`);
  if (data.dimensionMismatches > 0) {
    console.warn(`   ⚠️  ${data.dimensionMismatches} dimension mismatches`);
  }
});

vectorPlugin.on('vector:search-error', (data) => {
  console.error(`❌ Search error on ${data.resource}:`, data.error);
});
```

#### Clustering Progress Tracking

```javascript
// Enable verbose events for progress tracking
const vectorPlugin = new VectorPlugin({
  verboseEvents: true,
  eventThrottle: 500  // Update every 500ms
});

let lastIteration = 0;

vectorPlugin.on('vector:cluster-start', (data) => {
  console.log(`\n🎯 Clustering ${data.vectorCount} vectors with k=${data.k}`);
  console.log(`   Resource: ${data.resource}`);
  console.log(`   Distance metric: ${data.distanceMetric}`);
  console.log(`   Max iterations: ${data.maxIterations}\n`);
  lastIteration = 0;
});

vectorPlugin.on('vector:cluster-iteration', (data) => {
  if (data.iteration > lastIteration) {
    const bar = '█'.repeat(Math.floor(data.iteration / data.maxIterations * 20));
    console.log(`   Iteration ${data.iteration}: ${bar} Inertia: ${data.inertia.toFixed(2)}`);
    lastIteration = data.iteration;
  }
});

vectorPlugin.on('vector:cluster-converged', (data) => {
  console.log(`\n✅ Converged after ${data.iterations} iterations!`);
  console.log(`   Final inertia: ${data.inertia.toFixed(2)}`);
});

vectorPlugin.on('vector:cluster-complete', (data) => {
  console.log(`\n📊 Clustering Results:`);
  console.log(`   Duration: ${data.duration}ms`);
  console.log(`   Cluster sizes:`, data.clusterSizes);
  console.log(`   Converged: ${data.converged ? 'Yes' : 'No'}\n`);
});
```

**Output**:
```
🎯 Clustering 1000 vectors with k=5
   Resource: products
   Distance metric: cosine
   Max iterations: 100

   Iteration 1: ████░░░░░░░░░░░░░░░░ Inertia: 1234.56
   Iteration 2: ████████░░░░░░░░░░░░ Inertia: 987.65
   Iteration 3: ████████████░░░░░░░░ Inertia: 765.43
   Iteration 4: ████████████████░░░░ Inertia: 654.32
   Iteration 5: ████████████████████ Inertia: 623.21

✅ Converged after 5 iterations!
   Final inertia: 623.21

📊 Clustering Results:
   Duration: 1234ms
   Cluster sizes: [ 234, 198, 256, 187, 125 ]
   Converged: Yes
```

#### Production Monitoring with Metrics

```javascript
import { Database, VectorPlugin } from 's3db';
import prometheus from 'prom-client';

// Prometheus metrics
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

// Hook up events
vectorPlugin.on('vector:search-complete', (data) => {
  searchDuration.labels(data.resource, data.distanceMetric).observe(data.duration);
  searchResults.labels(data.resource).observe(data.resultsCount);

  if (data.dimensionMismatches > 0) {
    dimensionMismatches.labels(data.resource).inc(data.dimensionMismatches);
  }
});

vectorPlugin.on('vector:cluster-complete', (data) => {
  clusteringDuration.labels(data.resource, data.k.toString()).observe(data.duration);
});

// Alert on errors
vectorPlugin.on('vector:search-error', (data) => {
  logger.error('Vector search error', {
    resource: data.resource,
    error: data.error,
    timestamp: data.timestamp
  });

  alerting.notify('VectorPlugin Search Error', data);
});

vectorPlugin.on('vector:cluster-error', (data) => {
  logger.error('Vector clustering error', {
    resource: data.resource,
    error: data.error,
    timestamp: data.timestamp
  });

  alerting.notify('VectorPlugin Clustering Error', data);
});
```

#### Auto-detection Feedback

```javascript
// Get notified when vector fields are auto-detected
vectorPlugin.on('vector:field-detected', (data) => {
  console.log(`✨ Auto-detected vector field: ${data.vectorField}`);
  console.log(`   Resource: ${data.resource}`);

  // Optional: Log for audit trail
  logger.info('Vector field auto-detected', data);
});

// Now you can omit vectorField parameter
const results = await products.vectorSearch(queryVector, {
  limit: 10  // vectorField automatically detected as 'embedding'
});
```

#### Development/Debugging with Verbose Events

```javascript
if (process.env.NODE_ENV === 'development') {
  const vectorPlugin = new VectorPlugin({
    verboseEvents: true,    // Enable all events
    eventThrottle: 50       // Fast updates for debugging
  });

  // Log everything
  vectorPlugin.on('vector:search-progress', (data) => {
    console.log(`[PROGRESS] Processed ${data.processed}/${data.total} (${data.progress.toFixed(1)}%)`);
  });

  vectorPlugin.on('vector:dimension-mismatch', (data) => {
    console.warn(`[MISMATCH] Record ${data.recordIndex}: expected ${data.expected} dims, got ${data.got}`);
  });

  vectorPlugin.on('vector:performance', (data) => {
    console.log(`[PERF] ${data.operation} on ${data.resource}: ${data.duration}ms (${data.throughput} records/s)`);
  });

  vectorPlugin.on('vector:partition-filter', (data) => {
    console.log(`[PARTITION] Filtering by partition: ${JSON.stringify(data.partition)}`);
  });
}
```

#### Analytics & Business Intelligence

```javascript
// Track vector operations for analytics
const analytics = {
  searches: 0,
  clusterings: 0,
  avgSearchDuration: 0,
  avgClusteringDuration: 0,
  totalVectorsProcessed: 0
};

vectorPlugin.on('vector:search-complete', (data) => {
  analytics.searches++;
  analytics.avgSearchDuration =
    (analytics.avgSearchDuration * (analytics.searches - 1) + data.duration) / analytics.searches;
  analytics.totalVectorsProcessed += data.processedRecords;

  // Send to analytics platform
  mixpanel.track('Vector Search', {
    resource: data.resource,
    resultsCount: data.resultsCount,
    duration: data.duration,
    throughput: data.throughput
  });
});

vectorPlugin.on('vector:cluster-complete', (data) => {
  analytics.clusterings++;
  analytics.avgClusteringDuration =
    (analytics.avgClusteringDuration * (analytics.clusterings - 1) + data.duration) / analytics.clusterings;

  mixpanel.track('Vector Clustering', {
    resource: data.resource,
    k: data.k,
    vectorCount: data.vectorCount,
    iterations: data.iterations,
    converged: data.converged,
    duration: data.duration
  });
});

// Periodic reporting
setInterval(() => {
  console.log('\n📊 Vector Analytics Report:');
  console.log(`   Total searches: ${analytics.searches}`);
  console.log(`   Total clusterings: ${analytics.clusterings}`);
  console.log(`   Avg search duration: ${analytics.avgSearchDuration.toFixed(2)}ms`);
  console.log(`   Avg clustering duration: ${analytics.avgClusteringDuration.toFixed(2)}ms`);
  console.log(`   Total vectors processed: ${analytics.totalVectorsProcessed.toLocaleString()}`);
}, 60000); // Every minute
```

#### Quality Monitoring

```javascript
// Monitor search quality and alert on degradation
const qualityThresholds = {
  minResults: 5,              // Alert if < 5 results
  maxAvgDistance: 0.7,        // Alert if avg distance > 0.7
  maxDimensionMismatches: 10  // Alert if > 10 mismatches
};

let recentSearches = [];

vectorPlugin.on('vector:search-complete', (data) => {
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

### Event Configuration Best Practices

#### Production Setup

```javascript
// Production: Only essential events
const vectorPlugin = new VectorPlugin({
  emitEvents: true,       // Enable monitoring
  verboseEvents: false,   // Disable verbose (performance)
  eventThrottle: 1000     // Throttle to reduce overhead
});
```

#### Development Setup

```javascript
// Development: All events for debugging
const vectorPlugin = new VectorPlugin({
  emitEvents: true,
  verboseEvents: true,    // Full visibility
  eventThrottle: 100      // Fast updates
});
```

#### Performance Testing

```javascript
// Performance testing: Disable events
const vectorPlugin = new VectorPlugin({
  emitEvents: false       // No event overhead
});
```

### Event Throttling

Progress events (`vector:search-progress`, `vector:cluster-iteration`) are automatically throttled to prevent event spam:

```javascript
// Default: 100ms throttle
const vectorPlugin = new VectorPlugin({
  eventThrottle: 100  // Max 1 progress event per 100ms
});

// Fast updates (more CPU overhead)
const vectorPlugin = new VectorPlugin({
  eventThrottle: 50   // Max 1 progress event per 50ms
});

// Slow updates (less CPU overhead)
const vectorPlugin = new VectorPlugin({
  eventThrottle: 500  // Max 1 progress event per 500ms
});
```

## Performance Tips

### Distance Metric Selection

| Use Case | Recommended Metric | Why |
|----------|-------------------|-----|
| Text embeddings | Cosine | Direction matters, magnitude doesn't |
| Image features | Euclidean | Absolute differences matter |
| High-dimensional data | Manhattan | Faster, less sensitive to outliers |
| Normalized vectors | Cosine or Dot Product | Already unit length |

### Memory & Storage

1. **Use partitions** for large datasets:
```javascript
// Partition by category for faster filtered search
const products = await db.createResource({
  name: 'products',
  partitions: {
    byCategory: {
      fields: { category: 'string' }
    }
  }
});
```

2. **Batch operations** for large inserts:
```javascript
// Insert many at once
await products.insertMany(items);
```

3. **Limit vector dimensions** if possible:
- 128-256 dims: Fast, good for most use cases
- 512-768 dims: Sentence Transformers, balanced
- 1536 dims: OpenAI text-embedding-3-small/3-large, best quality but slower
- 3072 dims: OpenAI text-embedding-3-large (maximum quality, requires more storage)

### Clustering Performance

- **Start with small maxK**: Test 2-10 before going higher
- **Use fewer stabilityRuns** for initial exploration: `stabilityRuns: 3`
- **Reduce nReferences** for Gap Statistic: `nReferences: 5`
- **Cache results**: Store optimal K analysis results

```javascript
// Fast exploration
const quickAnalysis = await VectorPlugin.findOptimalK(vectors, {
  minK: 2,
  maxK: 5,
  nReferences: 3,
  stabilityRuns: 2
});

// Detailed analysis later
const detailedAnalysis = await VectorPlugin.findOptimalK(vectors, {
  minK: 2,
  maxK: 10,
  nReferences: 10,
  stabilityRuns: 5
});
```

## Troubleshooting

### Error: "No vectors found in resource"

**Cause**: Trying to cluster/search but records don't have vector field.

**Solution**:
```javascript
// Ensure vectors are present
const record = await resource.get(id);
console.log('Has vector?', !!record.vector);

// Check vector field name
await resource.cluster({
  k: 3,
  vectorField: 'embedding'  // Use correct field name
});
```

### Error: "Dimension mismatch"

**Cause**: Vectors have different dimensions.

**Solution**:
```javascript
// Validate all vectors have same dimensions
const allProducts = await products.getAll();
const dimensions = new Set(allProducts.map(p => p.vector?.length));

if (dimensions.size > 1) {
  console.error('Multiple dimensions found:', [...dimensions]);
  // Fix: regenerate embeddings with consistent model
}
```

### Warning: "Vector fields exceed metadata limit"

**Cause**: Vectors too large for S3 metadata (2KB limit).

**Solution**:
```javascript
// Use embedding notation (automatically optimizes storage)
await db.createResource({
  name: 'products',
  attributes: {
    vector: 'embedding:1536'  // ✨ Auto-compression + validation
  },
  behavior: 'body-overflow'  // ← Still recommended for large vectors
});
```

Or enable auto-fix:
```javascript
const vectorPlugin = new VectorPlugin({
  autoFixBehavior: true  // Automatically set body-overflow
});
```

### Poor Clustering Results

**Symptoms**: All points in one cluster, or random-looking clusters.

**Causes & Solutions**:

1. **Wrong distance metric**:
```javascript
// For text embeddings, use cosine
await resource.cluster({
  k: 5,
  distanceMetric: 'cosine'  // Not euclidean
});
```

2. **K too high or too low**:
```javascript
// Let algorithm find optimal K
const analysis = await VectorPlugin.findOptimalK(vectors);
const k = analysis.consensus;
```

3. **Data not normalized**:
```javascript
// Normalize vectors before storage
const normalized = VectorPlugin.normalize(vector);
await resource.insert({ id, vector: normalized });
```

4. **Insufficient data**:
- Need at least 50-100 vectors per expected cluster
- If K=5, need 250-500+ vectors minimum

### Slow Search Performance

**Causes & Solutions**:

1. **Too many records**:
```javascript
// Use partitions to filter
await resource.vectorSearch(query, {
  partition: 'byCategory',
  partitionValues: { category: 'Electronics' }
});
```

2. **High dimensions**:
- Consider using smaller embeddings (384 instead of 1536)
- Use faster distance metric (Manhattan instead of Euclidean)

3. **No indexing**:
```javascript
// Create partitions for common filters
const products = await db.createResource({
  partitions: {
    byCategory: { fields: { category: 'string' } },
    byPrice: { fields: { priceRange: 'string' } }
  }
});
```

## Best Practices

### 1. Generate Quality Embeddings

```javascript
// Use latest models
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function getEmbedding(text) {
  // Clean text first
  const cleaned = text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');

  const response = await openai.embeddings.create({
    model: 'text-embedding-3-large',  // Best quality (1536 dims) - or use 3-small for lower cost
    input: cleaned
  });

  return response.data[0].embedding;
}
```

### 2. Validate Vectors

```javascript
// When using embedding notation, dimension validation is automatic!
const products = await db.createResource({
  name: 'products',
  attributes: {
    vector: 'embedding:1536'  // ✅ Dimension validation built-in
  }
});

// Hook to validate additional constraints
products.beforeInsert(async (data) => {
  if (data.vector) {
    // Check for NaN/Infinity
    if (data.vector.some(v => !isFinite(v))) {
      throw new Error('Vector contains invalid values');
    }

    // Optionally normalize
    data.vector = VectorPlugin.normalize(data.vector);
  }

  return data;
});
```

### 3. Monitor Quality

```javascript
// Track search quality
const results = await products.vectorSearch(query, { limit: 10 });

// Log metrics
console.log(`Search returned ${results.length} results`);
console.log(`Best match distance: ${results[0]?.distance.toFixed(4)}`);
console.log(`Worst match distance: ${results[results.length-1]?.distance.toFixed(4)}`);

// Alert if quality drops
if (results[0]?.distance > 0.5) {
  console.warn('⚠️  Poor match quality - consider retraining embeddings');
}
```

### 4. Cache Expensive Operations

```javascript
// Cache optimal K analysis
const cacheKey = `optimal-k-${vectors.length}`;
let analysis = await cache.get(cacheKey);

if (!analysis) {
  analysis = await VectorPlugin.findOptimalK(vectors);
  await cache.set(cacheKey, analysis, { ttl: 86400 }); // 24h
}
```

### 5. Version Your Embeddings

```javascript
// Track embedding model version
await products.insert({
  id: 'prod-1',
  name: 'Laptop',
  vector: embedding,
  vectorModel: 'text-embedding-3-large',
  vectorVersion: '2024-01',
  vectorDimensions: 1536
});

// Migrate when upgrading models
async function migrateEmbeddings(oldVersion, newVersion) {
  const oldProducts = await products.list({
    filter: { vectorVersion: oldVersion }
  });

  for (const product of oldProducts) {
    const newVector = await getEmbedding(product.description);
    await products.update(product.id, {
      vector: newVector,
      vectorVersion: newVersion
    });
  }
}
```

## More Examples

See the `examples/` directory for complete working examples:

- `examples/vector-search.js` - Similarity search
- `examples/vector-clustering.js` - K-means clustering
- `examples/vector-optimal-k.js` - Optimal K analysis

## Error Reference

See [Error Handling documentation](../errors.md) for complete error reference.

Common VectorPlugin errors:

- `VectorError`: Base error for all vector operations
- `DimensionMismatchError`: Vectors have different dimensions
- `InvalidMetricError`: Unknown distance metric specified
- `NoVectorsError`: Resource has no vectors to process

## Related Documentation

- [Cache Plugin](./cache.md) - Speed up vector searches
- [Partitions](../partitions.md) - Organize vectors for faster filtering
- [Behaviors](../behaviors.md) - Handle large vectors with body-overflow
- [Hooks](../hooks.md) - Validate vectors before insert
