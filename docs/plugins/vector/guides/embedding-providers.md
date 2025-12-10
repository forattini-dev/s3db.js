# 🔑 Embedding Providers Guide

**Prev:** [Getting Started](./getting-started.md)
**Next:** [Usage Patterns](./usage-patterns.md)
**Main:** [README](/plugins/vector/README.md) | **All guides:** [Index](/plugins/vector/README.md#-documentation-index)

> **In this guide:**
> - 5 embedding provider options
> - Model selection guide
> - Cost and quality comparison
> - Code examples for each provider
> - Dimension recommendations

**Time to read:** 15 minutes
**Difficulty:** Beginner → Intermediate

---

## Overview

VectorPlugin doesn't generate embeddings—you need an external provider. Here are the most popular options in 2025:

| Provider | Best For | Dimensions | Cost |
|----------|----------|-----------|------|
| **OpenAI** | General purpose (recommended) | 1536 | $0.00002/1K tokens |
| **Google Vertex AI** | Enterprise, flexible dims | 768-3072 | Free* |
| **Cohere** | Semantic search, multilingual | 1024 | $0.0001/1K tokens |
| **Voyage AI** | Claude RAG, domain-specific | 1024 | $0.00012/1K tokens |
| **Open Source** | Self-hosted, no API costs | 128-1024 | Free (self-hosted) |

---

## 1. OpenAI (Recommended)

### Models

- **`text-embedding-3-small`** - 1536D, best cost/quality ($0.00002/1K tokens)
- **`text-embedding-3-large`** - 1536/3072D, highest quality ($0.00013/1K tokens)

### Features
- ✅ Best-in-class performance
- ✅ Adjustable dimensions (256-3072)
- ✅ Multilingual support
- ✅ Low cost
- ✅ Latest technology

### Installation

```bash
pnpm install openai
```

### Code Example

```javascript
import OpenAI from 'openai';
import { Database, VectorPlugin } from 's3db';

const db = new Database('s3://key:secret@bucket');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const vectorPlugin = new VectorPlugin({ dimensions: 1536 });
await vectorPlugin.install(db);
await db.connect();

// Create resource
const products = await db.createResource({
  name: 'products',
  attributes: {
    id: 'string|required',
    name: 'string|required',
    description: 'string',
    vector: 'embedding:1536'  // OpenAI default
  },
  behavior: 'body-overflow'
});

// Get embedding from OpenAI
async function getEmbedding(text, options = {}) {
  const response = await openai.embeddings.create({
    model: options.model || 'text-embedding-3-small',
    input: text,
    dimensions: options.dimensions  // Optional: 256-1536
  });
  return response.data[0].embedding;
}

// Store product with embedding
const embedding = await getEmbedding('Gaming laptop with RGB keyboard');
await products.insert({
  id: 'prod-1',
  name: 'Gaming Laptop',
  description: 'High-performance laptop for gaming',
  vector: embedding,
  vectorModel: 'text-embedding-3-small',
  vectorDimensions: 1536
});

// Search for similar products
const queryEmbedding = await getEmbedding('laptop computer');
const similar = await vectorPlugin.findSimilar(
  'products',
  'vector',
  queryEmbedding,
  { k: 5 }
);

console.log('Similar products:', similar);
```

### Pro Tips

**Dimension reduction:**
```javascript
// text-embedding-3-large with reduced dimensions = quality at low cost
const embedding = await openai.embeddings.create({
  model: 'text-embedding-3-large',  // Highest quality
  input: text,
  dimensions: 256  // But only use 256 dimensions!
  // Result: 3072-quality embeddings in 256D = best compression
});
```

**Batch processing:**
```javascript
// Process multiple texts at once (cheaper)
const response = await openai.embeddings.create({
  model: 'text-embedding-3-small',
  input: [
    'Product 1 description',
    'Product 2 description',
    'Product 3 description'
  ]  // All at once!
});

const embeddings = response.data.map(e => e.embedding);
```

---

## 2. Google Vertex AI

### Models

- **`gemini-embedding-001`** - 768/1536/3072D, recommended (free)
- **`text-embedding-005`** - 768D, optimized for English (free)
- **`text-multilingual-embedding-002`** - 768D, 100+ languages (free)

### Features
- ✅ **Free** tier available
- ✅ Flexible dimensions (MRL - Matryoshka Representation Learning)
- ✅ Multilingual support
- ✅ Enterprise grade
- ✅ Google Cloud integration

### Installation

```bash
pnpm install @google-cloud/vertexai
```

### Code Example

```javascript
import { VertexAI } from '@google-cloud/vertexai';
import { Database, VectorPlugin } from 's3db';

const db = new Database('s3://key:secret@bucket');

const vertexAI = new VertexAI({
  project: process.env.GOOGLE_CLOUD_PROJECT,
  location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1'
});

const vectorPlugin = new VectorPlugin({ dimensions: 768 });
await vectorPlugin.install(db);
await db.connect();

// Create resource
const documents = await db.createResource({
  name: 'documents',
  attributes: {
    id: 'string|required',
    title: 'string|required',
    content: 'string',
    vector: 'embedding:768'  // Google default
  },
  behavior: 'body-overflow'
});

// Get embedding from Vertex AI
const model = vertexAI.preview.getGenerativeModel({
  model: 'gemini-embedding-001'
});

async function getEmbedding(text, dimensions = 768) {
  const result = await model.embedContent({
    content: [{ role: 'user', parts: [{ text }] }],
    outputDimensionality: dimensions  // 768, 1536, or 3072
  });
  return result.embedding.values;
}

// Store document with embedding
const embedding = await getEmbedding(
  'Machine learning tutorial for beginners',
  768
);

await documents.insert({
  id: 'doc-1',
  title: 'ML Intro',
  content: 'Introduction to machine learning',
  vector: embedding,
  vectorModel: 'gemini-embedding-001',
  vectorDimensions: 768
});

// Search for similar documents
const queryEmbedding = await getEmbedding('AI training guide', 768);
const similar = await vectorPlugin.findSimilar(
  'documents',
  'vector',
  queryEmbedding,
  { k: 5 }
);
```

### Dimension Recommendations

```javascript
// 768: Best balance (default)
// - Fast computation
// - Good compression with s3db
// - Sufficient quality for most uses
await getEmbedding(text, 768);

// 1536: Higher quality
// - Double the dimensions
// - More storage (but still fits with compression)
// - Better for critical applications
await getEmbedding(text, 1536);

// 3072: Maximum quality
// - Full dimensional representation
// - For extremely high-accuracy search
// - More storage required
await getEmbedding(text, 3072);
```

---

## 3. Cohere

### Models

- **`embed-english-v3.0`** - 1024D, best English performance
- **`embed-multilingual-v3.0`** - 1024D, 100+ languages
- **`embed-english-light-v3.0`** - 384D, faster, lighter
- **`embed-multilingual-image-v3.0`** - 1024D, multimodal (text + images)

### Features
- ✅ Task-specific optimization
- ✅ Multimodal support (text + images)
- ✅ Semantic search optimized
- ✅ Input type specification (document vs query)
- ✅ Compression-aware training

### Installation

```bash
pnpm install cohere-ai
```

### Code Example

```javascript
import { CohereClient } from 'cohere-ai';
import { Database, VectorPlugin } from 's3db';

const db = new Database('s3://key:secret@bucket');
const cohere = new CohereClient({
  token: process.env.COHERE_API_KEY
});

const vectorPlugin = new VectorPlugin({ dimensions: 1024 });
await vectorPlugin.install(db);
await db.connect();

// Create resource
const articles = await db.createResource({
  name: 'articles',
  attributes: {
    id: 'string|required',
    title: 'string|required',
    content: 'string',
    vector: 'embedding:1024'  // Cohere standard
  },
  behavior: 'body-overflow'
});

// Get embedding from Cohere
async function getEmbedding(text, options = {}) {
  const response = await cohere.embed({
    texts: [text],
    model: options.model || 'embed-english-v3.0',
    inputType: options.inputType || 'search_document',
    embeddingTypes: ['float']
  });
  return response.embeddings.float[0];
}

// Store article with embedding
const embedding = await getEmbedding(
  'Deep learning advances in NLP',
  { inputType: 'search_document' }  // Optimized for documents
);

await articles.insert({
  id: 'article-1',
  title: 'Deep Learning Advances',
  content: 'Latest research in deep learning',
  vector: embedding,
  vectorModel: 'embed-english-v3.0',
  vectorDimensions: 1024
});

// Search with query-optimized embedding
const queryEmbedding = await getEmbedding(
  'machine learning tutorial',
  { inputType: 'search_query' }  // Optimized for queries
);

const similar = await vectorPlugin.findSimilar(
  'articles',
  'vector',
  queryEmbedding,
  { k: 5 }
);
```

### Input Types (Critical!)

**`search_document`**: For indexing documents
```javascript
// Use when STORING documents
const embedding = await getEmbedding(text, {
  inputType: 'search_document'
});
await articles.insert({ content: text, vector: embedding });
```

**`search_query`**: For search queries
```javascript
// Use when QUERYING
const queryEmbedding = await getEmbedding('search term', {
  inputType: 'search_query'
});
const results = await vectorPlugin.findSimilar(..., queryEmbedding);
```

**Why?** Cohere trains asymmetric embeddings - documents and queries are optimized differently.

---

## 4. Voyage AI (Anthropic Recommended)

### Models

- **`voyage-3`** - 1024D, best general-purpose
- **`voyage-3-large`** - 1024D, highest quality
- **`voyage-code-3`** - 1536D, code-specific
- **`voyage-finance-2`** - 1024D, finance domain
- **`voyage-law-2`** - 1024D, legal domain
- **`voyage-multilingual-2`** - 1024D, multilingual

### Features
- ✅ **Anthropic recommended** for Claude RAG
- ✅ Domain-specific models
- ✅ Excellent code embeddings
- ✅ Multilingual support
- ✅ Optimized for retrieval

### Installation

```bash
pnpm install voyageai
```

### Code Example

```javascript
import { VoyageAIClient } from 'voyageai';
import { Database, VectorPlugin } from 's3db';
import Anthropic from '@anthropic-ai/sdk';

const db = new Database('s3://key:secret@bucket');
const voyage = new VoyageAIClient({
  apiKey: process.env.VOYAGE_API_KEY
});
const anthropic = new Anthropic();

const vectorPlugin = new VectorPlugin({ dimensions: 1024 });
await vectorPlugin.install(db);
await db.connect();

// Create knowledge base resource
const knowledge = await db.createResource({
  name: 'knowledge_base',
  attributes: {
    id: 'string|required',
    title: 'string|required',
    content: 'string',
    vector: 'embedding:1024'
  },
  behavior: 'body-overflow'
});

// Get embedding from Voyage AI
async function getEmbedding(text, model = 'voyage-3') {
  const response = await voyage.embed({
    input: [text],
    model: model,
    inputType: 'document'
  });
  return response.data[0].embedding;
}

// Store document
const embedding = await getEmbedding(
  'Cloud computing infrastructure guide',
  'voyage-3'
);

await knowledge.insert({
  id: 'kb-1',
  title: 'Cloud Computing',
  content: 'Complete guide to cloud infrastructure',
  vector: embedding,
  vectorModel: 'voyage-3',
  vectorDimensions: 1024
});

// RAG: Retrieve + Generate with Claude
async function ragQuery(query) {
  // Step 1: Get query embedding
  const queryResponse = await voyage.embed({
    input: [query],
    model: 'voyage-3',
    inputType: 'query'
  });
  const queryEmbedding = queryResponse.data[0].embedding;

  // Step 2: Search knowledge base
  const results = await vectorPlugin.findSimilar(
    'knowledge_base',
    'vector',
    queryEmbedding,
    { k: 5 }
  );

  // Step 3: Build context from results
  const context = results
    .map(r => r.record.content)
    .join('\n\n');

  // Step 4: Generate answer with Claude
  const message = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `Context:\n${context}\n\nQuestion: ${query}`
    }]
  });

  return message.content[0].text;
}

// Use it
const answer = await ragQuery('What is cloud computing?');
console.log(answer);
```

### Domain-Specific Models

**Code embeddings:**
```javascript
const codeEmbedding = await getEmbedding(
  'function isPrime(n) { ... }',
  'voyage-code-3'  // Specialized for code
);
```

**Finance embeddings:**
```javascript
const financeEmbedding = await getEmbedding(
  'Q4 earnings report',
  'voyage-finance-2'  // Specialized for finance
);
```

---

## 5. Open Source / Self-Hosted

### Models

- **Sentence Transformers** - 384D, fast, free
- **BGE** - 384-1024D, best open-source
- **nomic-embed-text** - 768D, good quality
- **all-MiniLM-L6-v2** - 384D, very fast

### Features
- ✅ **Free** - No API costs
- ✅ **Private** - Run locally
- ✅ **Fast** - Instant embedding
- ✅ **No limits** - Embed as much as you want
- ❌ **Slower** - CPU-bound unless you have GPUs
- ❌ **Setup required** - Self-hosted infrastructure

### Local Example with Sentence Transformers

```javascript
// Option 1: Local HTTP API
import axios from 'axios';

async function getEmbedding(text) {
  const response = await axios.post(
    'http://localhost:8000/embeddings',
    { input: text }
  );
  return response.data.data[0].embedding;
}

// Option 2: Node.js library
import { pipeline } from '@xenova/transformers';

// One-time initialization
const extractor = await pipeline(
  'feature-extraction',
  'Xenova/all-MiniLM-L6-v2'
);

async function getEmbedding(text) {
  const result = await extractor(text, {
    pooling: 'mean',
    normalize: true
  });
  return result.data;  // Array of embeddings
}

// Usage
const embedding = await getEmbedding('Hello world');
```

---

## Model Comparison Table

Complete comparison of all options:

| Provider | Model | Dimensions | Cost (per 1M tokens) | Speed | Quality | Use Case |
|----------|-------|-----------|---------------------|-------|---------|----------|
| OpenAI | text-embedding-3-small | 1536 | $0.02 | Fast | ⭐⭐⭐⭐⭐ | **Default choice** |
| OpenAI | text-embedding-3-large | 1536/3072 | $0.13 | Fast | ⭐⭐⭐⭐⭐ | High accuracy needed |
| Google | gemini-embedding-001 | 768-3072 | Free* | Fast | ⭐⭐⭐⭐ | Enterprise, flexible |
| Google | text-embedding-005 | 768 | Free* | Fast | ⭐⭐⭐⭐ | English only |
| Cohere | embed-english-v3.0 | 1024 | $0.10 | Fast | ⭐⭐⭐⭐ | Semantic search |
| Cohere | embed-english-light-v3.0 | 384 | $0.10 | Fast | ⭐⭐⭐ | Cost optimization |
| Voyage | voyage-3 | 1024 | $0.12 | Fast | ⭐⭐⭐⭐⭐ | Claude RAG |
| Voyage | voyage-code-3 | 1536 | $0.12 | Fast | ⭐⭐⭐⭐⭐ | Code search |
| OSS | all-MiniLM-L6-v2 | 384 | Free | Fast | ⭐⭐⭐ | Local, budget |

---

## Storage Size After Compression

With s3db's automatic compression (`embedding:XXX` notation):

| Dimensions | Uncompressed | Compressed | Savings | Fits in Metadata? |
|-----------|--------------|-----------|---------|------------------|
| 128 | 1 KB | 240 bytes | 76% | ✅ YES |
| 384 | 2.7 KB | 620 bytes | 77% | ✅ YES |
| 768 | 5.4 KB | 1.2 KB | 78% | ✅ YES |
| 1024 | 7.2 KB | 1.7 KB | 76% | ✅ YES |
| 1536 | 10.8 KB | 2.5 KB | 77% | ✅ YES |
| 3072 | 21.6 KB | 5.0 KB | 77% | ⚠️ USE body-overflow |

---

## Decision Guide

### Which provider should I choose?

**Start here:**
```
Are you using Claude / Anthropic?
├─ Yes → Voyage AI (anthropic-recommended)
└─ No → OpenAI text-embedding-3-small (best cost/performance)

Do you have a Google Cloud project?
├─ Yes → Vertex AI (free tier available)
└─ No → Continue above

Do you want to run embeddings locally?
├─ Yes → Sentence Transformers (open-source, free)
└─ No → Use API option above

Do you need domain-specific models?
├─ Code → Voyage code-3
├─ Finance → Voyage finance-2
├─ Semantic search → Cohere
└─ General → OpenAI or Voyage
```

---

## 📚 See Also

- **[Getting Started](./getting-started.md)** - Installation and first steps
- **[Usage Patterns](./usage-patterns.md)** - Real-world examples
- **[API Reference](./api-reference.md)** - Method documentation
- **[Advanced](./advanced.md)** - Events and monitoring

---

**Ready to choose?** Pick a provider and follow [Getting Started](./getting-started.md) to set it up!
