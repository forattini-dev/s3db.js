/**
 * Vector Embedding Integrations
 *
 * Examples of integrating s3db.js with popular embedding providers:
 * - OpenAI (text-embedding-3-small, text-embedding-3-large)
 * - Anthropic/Voyage AI (voyage-3, voyage-3-large)
 * - Cohere (embed-english-v3.0, embed-multilingual-v3.0)
 * - Google (Gecko, textembedding-gecko)
 * - Mistral (mistral-embed)
 * - Local models (Sentence Transformers via Transformers.js)
 */

import { S3db } from 's3db.js';
import { VectorPlugin } from 's3db.js';

// ============================================================================
// 1. OpenAI Embeddings
// ============================================================================

/**
 * OpenAI text-embedding-3-small (1536 dims)
 * - Fast and cost-effective
 * - Good for most use cases
 * - $0.02 per 1M tokens
 */
async function setupOpenAISmall() {
  const OpenAI = (await import('openai')).default;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const db = new S3db({ connectionString: process.env.S3DB_CONNECTION });
  await db.connect();

  const vectorPlugin = new VectorPlugin({
    dimensions: 1536,
    distanceMetric: 'cosine'
  });
  await vectorPlugin.install(db);

  const docs = await db.createResource({
    name: 'openai_docs',
    attributes: {
      id: 'string|required',
      text: 'string|required',
      embedding: 'embedding:1536' // ✨ Auto-compressed
    },
    behavior: 'body-overflow'
  });

  // Generate embedding
  async function embed(text) {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text
    });
    return response.data[0].embedding;
  }

  return { db, docs, embed };
}

/**
 * OpenAI text-embedding-3-large (3072 dims)
 * - Highest quality
 * - Best for critical applications
 * - $0.13 per 1M tokens
 */
async function setupOpenAILarge() {
  const OpenAI = (await import('openai')).default;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const db = new S3db({ connectionString: process.env.S3DB_CONNECTION });
  await db.connect();

  const vectorPlugin = new VectorPlugin({
    dimensions: 3072,
    distanceMetric: 'cosine'
  });
  await vectorPlugin.install(db);

  const docs = await db.createResource({
    name: 'openai_large_docs',
    attributes: {
      id: 'string|required',
      text: 'string|required',
      embedding: 'embedding:3072' // ✨ 3072 dimensions
    },
    behavior: 'body-overflow'
  });

  async function embed(text) {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-large',
      input: text
    });
    return response.data[0].embedding;
  }

  // Optional: Shorten to 1536 dimensions for compatibility
  async function embedShortened(text) {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-large',
      input: text,
      dimensions: 1536
    });
    return response.data[0].embedding;
  }

  return { db, docs, embed, embedShortened };
}

// ============================================================================
// 2. Anthropic/Voyage AI Embeddings
// ============================================================================

/**
 * Voyage AI voyage-3 (1024 dims)
 * - Optimized for search and retrieval
 * - Excellent quality/cost ratio
 * - Recommended by Anthropic
 */
async function setupVoyage() {
  // Install: npm install voyageai
  const { VoyageAIClient } = await import('voyageai');
  const voyage = new VoyageAIClient({
    apiKey: process.env.VOYAGE_API_KEY
  });

  const db = new S3db({ connectionString: process.env.S3DB_CONNECTION });
  await db.connect();

  const vectorPlugin = new VectorPlugin({
    dimensions: 1024,
    distanceMetric: 'cosine'
  });
  await vectorPlugin.install(db);

  const docs = await db.createResource({
    name: 'voyage_docs',
    attributes: {
      id: 'string|required',
      text: 'string|required',
      embedding: 'embedding:1024' // ✨ Voyage dimensions
    },
    behavior: 'body-overflow'
  });

  async function embed(text) {
    const response = await voyage.embed({
      input: text,
      model: 'voyage-3'
    });
    return response.embeddings[0];
  }

  // Batch embeddings for better performance
  async function embedBatch(texts) {
    const response = await voyage.embed({
      input: texts,
      model: 'voyage-3'
    });
    return response.embeddings;
  }

  return { db, docs, embed, embedBatch };
}

/**
 * Voyage AI voyage-3-large (2048 dims)
 * - Highest quality from Voyage
 * - Best for demanding applications
 */
async function setupVoyageLarge() {
  const { VoyageAIClient } = await import('voyageai');
  const voyage = new VoyageAIClient({
    apiKey: process.env.VOYAGE_API_KEY
  });

  const db = new S3db({ connectionString: process.env.S3DB_CONNECTION });
  await db.connect();

  const vectorPlugin = new VectorPlugin({
    dimensions: 2048,
    distanceMetric: 'cosine'
  });
  await vectorPlugin.install(db);

  const docs = await db.createResource({
    name: 'voyage_large_docs',
    attributes: {
      id: 'string|required',
      text: 'string|required',
      embedding: 'embedding:2048' // ✨ Large dimensions
    },
    behavior: 'body-overflow'
  });

  async function embed(text) {
    const response = await voyage.embed({
      input: text,
      model: 'voyage-3-large'
    });
    return response.embeddings[0];
  }

  return { db, docs, embed };
}

// ============================================================================
// 3. Cohere Embeddings
// ============================================================================

/**
 * Cohere embed-english-v3.0 (1024 dims)
 * - Excellent for English text
 * - Fast and reliable
 * - Supports search and classification
 */
async function setupCohere() {
  const { CohereClient } = await import('cohere-ai');
  const cohere = new CohereClient({
    token: process.env.COHERE_API_KEY
  });

  const db = new S3db({ connectionString: process.env.S3DB_CONNECTION });
  await db.connect();

  const vectorPlugin = new VectorPlugin({
    dimensions: 1024,
    distanceMetric: 'cosine'
  });
  await vectorPlugin.install(db);

  const docs = await db.createResource({
    name: 'cohere_docs',
    attributes: {
      id: 'string|required',
      text: 'string|required',
      embedding: 'embedding:1024' // ✨ Cohere dimensions
    },
    behavior: 'body-overflow'
  });

  async function embed(text, inputType = 'search_document') {
    const response = await cohere.embed({
      texts: [text],
      model: 'embed-english-v3.0',
      inputType, // 'search_document' or 'search_query'
      embeddingTypes: ['float']
    });
    return response.embeddings.float[0];
  }

  // For queries (use different input type for better results)
  async function embedQuery(text) {
    return embed(text, 'search_query');
  }

  return { db, docs, embed, embedQuery };
}

/**
 * Cohere embed-multilingual-v3.0 (1024 dims)
 * - 100+ languages supported
 * - Great for international applications
 */
async function setupCohereMultilingual() {
  const { CohereClient } = await import('cohere-ai');
  const cohere = new CohereClient({
    token: process.env.COHERE_API_KEY
  });

  const db = new S3db({ connectionString: process.env.S3DB_CONNECTION });
  await db.connect();

  const vectorPlugin = new VectorPlugin({
    dimensions: 1024,
    distanceMetric: 'cosine'
  });
  await vectorPlugin.install(db);

  const docs = await db.createResource({
    name: 'cohere_multilingual_docs',
    attributes: {
      id: 'string|required',
      text: 'string|required',
      language: 'string|optional:true',
      embedding: 'embedding:1024' // ✨ Multilingual support
    },
    behavior: 'body-overflow'
  });

  async function embed(text, inputType = 'search_document') {
    const response = await cohere.embed({
      texts: [text],
      model: 'embed-multilingual-v3.0',
      inputType,
      embeddingTypes: ['float']
    });
    return response.embeddings.float[0];
  }

  return { db, docs, embed };
}

// ============================================================================
// 4. Google (Vertex AI) Embeddings
// ============================================================================

/**
 * Google textembedding-gecko (768 dims)
 * - Part of Vertex AI
 * - Good quality and performance
 * - Integrated with Google Cloud
 */
async function setupGoogleGecko() {
  // Install: npm install @google-cloud/aiplatform
  const { PredictionServiceClient } = await import('@google-cloud/aiplatform');
  const client = new PredictionServiceClient();

  const db = new S3db({ connectionString: process.env.S3DB_CONNECTION });
  await db.connect();

  const vectorPlugin = new VectorPlugin({
    dimensions: 768,
    distanceMetric: 'cosine'
  });
  await vectorPlugin.install(db);

  const docs = await db.createResource({
    name: 'google_gecko_docs',
    attributes: {
      id: 'string|required',
      text: 'string|required',
      embedding: 'embedding:768' // ✨ Gecko dimensions
    },
    behavior: 'body-overflow'
  });

  async function embed(text) {
    const endpoint = `projects/${process.env.GOOGLE_PROJECT_ID}/locations/us-central1/publishers/google/models/textembedding-gecko`;

    const [response] = await client.predict({
      endpoint,
      instances: [{ content: text }]
    });

    return response.predictions[0].embeddings.values;
  }

  return { db, docs, embed };
}

// ============================================================================
// 5. Mistral Embeddings
// ============================================================================

/**
 * Mistral mistral-embed (1024 dims)
 * - European alternative
 * - Good quality
 * - Privacy-focused
 */
async function setupMistral() {
  // Install: npm install @mistralai/mistralai
  const { MistralClient } = await import('@mistralai/mistralai');
  const mistral = new MistralClient(process.env.MISTRAL_API_KEY);

  const db = new S3db({ connectionString: process.env.S3DB_CONNECTION });
  await db.connect();

  const vectorPlugin = new VectorPlugin({
    dimensions: 1024,
    distanceMetric: 'cosine'
  });
  await vectorPlugin.install(db);

  const docs = await db.createResource({
    name: 'mistral_docs',
    attributes: {
      id: 'string|required',
      text: 'string|required',
      embedding: 'embedding:1024' // ✨ Mistral dimensions
    },
    behavior: 'body-overflow'
  });

  async function embed(text) {
    const response = await mistral.embeddings({
      model: 'mistral-embed',
      input: [text]
    });
    return response.data[0].embedding;
  }

  return { db, docs, embed };
}

// ============================================================================
// 6. Local Models (Transformers.js)
// ============================================================================

/**
 * Sentence Transformers via Transformers.js (384 dims)
 * - Runs locally in Node.js
 * - No API costs
 * - Privacy: data never leaves your infrastructure
 * - Great for development and privacy-sensitive applications
 */
async function setupTransformersJS() {
  // Install: npm install @xenova/transformers
  const { pipeline } = await import('@xenova/transformers');

  // Load model (cached after first run)
  const embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

  const db = new S3db({ connectionString: process.env.S3DB_CONNECTION });
  await db.connect();

  const vectorPlugin = new VectorPlugin({
    dimensions: 384,
    distanceMetric: 'cosine'
  });
  await vectorPlugin.install(db);

  const docs = await db.createResource({
    name: 'local_docs',
    attributes: {
      id: 'string|required',
      text: 'string|required',
      embedding: 'embedding:384' // ✨ Local model dimensions
    },
    behavior: 'body-overflow'
  });

  async function embed(text) {
    const output = await embedder(text, {
      pooling: 'mean',
      normalize: true
    });
    return Array.from(output.data);
  }

  return { db, docs, embed };
}

/**
 * BGE-small-en-v1.5 (384 dims)
 * - State-of-the-art small model
 * - Better quality than MiniLM
 * - Still runs locally
 */
async function setupBGESmall() {
  const { pipeline } = await import('@xenova/transformers');
  const embedder = await pipeline('feature-extraction', 'Xenova/bge-small-en-v1.5');

  const db = new S3db({ connectionString: process.env.S3DB_CONNECTION });
  await db.connect();

  const vectorPlugin = new VectorPlugin({
    dimensions: 384,
    distanceMetric: 'cosine'
  });
  await vectorPlugin.install(db);

  const docs = await db.createResource({
    name: 'bge_docs',
    attributes: {
      id: 'string|required',
      text: 'string|required',
      embedding: 'embedding:384' // ✨ BGE dimensions
    },
    behavior: 'body-overflow'
  });

  async function embed(text) {
    // BGE models need special prefix for queries
    const isQuery = text.length < 100; // Heuristic
    const prefixedText = isQuery ? `Represent this sentence for searching relevant passages: ${text}` : text;

    const output = await embedder(prefixedText, {
      pooling: 'mean',
      normalize: true
    });
    return Array.from(output.data);
  }

  return { db, docs, embed };
}

// ============================================================================
// Comparison Table
// ============================================================================

const EMBEDDING_PROVIDERS = {
  'OpenAI text-embedding-3-small': {
    dimensions: 1536,
    setup: setupOpenAISmall,
    cost: '$0.02 per 1M tokens',
    quality: '⭐⭐⭐⭐',
    speed: '⚡⚡⚡⚡',
    languages: 'Multilingual',
    useCase: 'General purpose, cost-effective'
  },
  'OpenAI text-embedding-3-large': {
    dimensions: 3072,
    setup: setupOpenAILarge,
    cost: '$0.13 per 1M tokens',
    quality: '⭐⭐⭐⭐⭐',
    speed: '⚡⚡⚡',
    languages: 'Multilingual',
    useCase: 'Highest quality, critical apps'
  },
  'Voyage AI voyage-3': {
    dimensions: 1024,
    setup: setupVoyage,
    cost: 'Competitive pricing',
    quality: '⭐⭐⭐⭐⭐',
    speed: '⚡⚡⚡⚡',
    languages: 'English-focused',
    useCase: 'Recommended by Anthropic'
  },
  'Cohere embed-english-v3.0': {
    dimensions: 1024,
    setup: setupCohere,
    cost: '$0.10 per 1M tokens',
    quality: '⭐⭐⭐⭐',
    speed: '⚡⚡⚡⚡',
    languages: 'English',
    useCase: 'English text, fast'
  },
  'Cohere embed-multilingual-v3.0': {
    dimensions: 1024,
    setup: setupCohereMultilingual,
    cost: '$0.10 per 1M tokens',
    quality: '⭐⭐⭐⭐',
    speed: '⚡⚡⚡⚡',
    languages: '100+ languages',
    useCase: 'International applications'
  },
  'Google Gecko': {
    dimensions: 768,
    setup: setupGoogleGecko,
    cost: 'GCP pricing',
    quality: '⭐⭐⭐⭐',
    speed: '⚡⚡⚡',
    languages: 'Multilingual',
    useCase: 'Google Cloud integration'
  },
  'Mistral mistral-embed': {
    dimensions: 1024,
    setup: setupMistral,
    cost: 'EU-based pricing',
    quality: '⭐⭐⭐⭐',
    speed: '⚡⚡⚡⚡',
    languages: 'Multilingual',
    useCase: 'Privacy-focused, EU'
  },
  'Local: MiniLM-L6-v2': {
    dimensions: 384,
    setup: setupTransformersJS,
    cost: 'FREE (local)',
    quality: '⭐⭐⭐',
    speed: '⚡⚡',
    languages: 'English',
    useCase: 'Development, privacy'
  },
  'Local: BGE-small-en-v1.5': {
    dimensions: 384,
    setup: setupBGESmall,
    cost: 'FREE (local)',
    quality: '⭐⭐⭐⭐',
    speed: '⚡⚡',
    languages: 'English',
    useCase: 'Production-ready local'
  }
};

// ============================================================================
// Demo: Compare All Providers
// ============================================================================

async function compareProviders() {
  console.log('🔬 Embedding Provider Comparison\n');
  console.log('Provider | Dimensions | Cost | Quality | Speed | Languages | Use Case');
  console.log('-'.repeat(100));

  for (const [name, info] of Object.entries(EMBEDDING_PROVIDERS)) {
    console.log(
      `${name.padEnd(35)} | ` +
      `${String(info.dimensions).padEnd(10)} | ` +
      `${info.cost.padEnd(20)} | ` +
      `${info.quality.padEnd(7)} | ` +
      `${info.speed.padEnd(5)} | ` +
      `${info.languages.padEnd(12)} | ` +
      `${info.useCase}`
    );
  }

  console.log('\n💡 All providers work seamlessly with s3db.js using the embedding:XXX notation!');
}

// ============================================================================
// Export
// ============================================================================

export {
  setupOpenAISmall,
  setupOpenAILarge,
  setupVoyage,
  setupVoyageLarge,
  setupCohere,
  setupCohereMultilingual,
  setupGoogleGecko,
  setupMistral,
  setupTransformersJS,
  setupBGESmall,
  EMBEDDING_PROVIDERS,
  compareProviders
};

// Run comparison if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  compareProviders().catch(console.error);
}
