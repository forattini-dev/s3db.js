/**
 * Complete RAG (Retrieval-Augmented Generation) Chatbot Example
 *
 * This example demonstrates how to build a production-ready chatbot that:
 * 1. Indexes documents with embeddings
 * 2. Searches for relevant context using vector similarity
 * 3. Generates responses using an LLM with retrieved context
 *
 * Stack:
 * - s3db.js for vector storage
 * - OpenAI for embeddings and chat completions
 * - Fixed-point encoding for 77% storage savings
 */

import { S3db } from 's3db.js';
import { VectorPlugin } from 's3db.js';
import OpenAI from 'openai';

// ============================================================================
// Configuration
// ============================================================================

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const EMBEDDING_MODEL = 'text-embedding-3-small'; // 1536 dimensions, fast & cheap
const CHAT_MODEL = 'gpt-4-turbo-preview';
const CHUNK_SIZE = 500; // Characters per document chunk
const TOP_K = 5; // Number of relevant chunks to retrieve

// ============================================================================
// Database Setup
// ============================================================================

async function setupDatabase() {
  const db = new S3db({
    connectionString: process.env.S3DB_CONNECTION || 's3://key:secret@bucket/rag-demo'
  });

  await db.connect();

  // Install vector plugin
  const vectorPlugin = new VectorPlugin({
    dimensions: 1536,
    distanceMetric: 'cosine'
  });
  await vectorPlugin.install(db);

  // Create knowledge base resource with embedding shorthand
  const knowledge = await db.createResource({
    name: 'knowledge_base',
    attributes: {
      id: 'string|required',
      content: 'string|required',         // Original text chunk
      source: 'string|required',          // Source document name
      embedding: 'embedding:1536',        // ✨ Auto-compressed (77% savings)
      chunkIndex: 'number|integer:true',  // Position in original document
      metadata: {
        type: 'object',
        optional: true,
        props: {
          author: 'string|optional:true',
          date: 'string|optional:true',
          category: 'string|optional:true'
        }
      }
    },
    behavior: 'body-overflow', // Handle large chunks
    timestamps: true,
    partitions: {
      bySource: { fields: { source: 'string' } },
      byCategory: { fields: { 'metadata.category': 'string' } }
    }
  });

  return { db, knowledge };
}

// ============================================================================
// Document Ingestion
// ============================================================================

/**
 * Split document into chunks for better retrieval
 */
function chunkDocument(text, chunkSize = CHUNK_SIZE) {
  const chunks = [];
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

  let currentChunk = '';
  let chunkIndex = 0;

  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length > chunkSize && currentChunk.length > 0) {
      chunks.push({ text: currentChunk.trim(), index: chunkIndex++ });
      currentChunk = sentence;
    } else {
      currentChunk += sentence;
    }
  }

  if (currentChunk.trim()) {
    chunks.push({ text: currentChunk.trim(), index: chunkIndex });
  }

  return chunks;
}

/**
 * Generate embedding for text using OpenAI
 */
async function generateEmbedding(text) {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text.replace(/\n/g, ' ').trim()
  });
  return response.data[0].embedding;
}

/**
 * Index a document into the knowledge base
 */
async function indexDocument(knowledge, {
  content,
  source,
  metadata = {}
}) {
  console.log(`\n📚 Indexing document: ${source}`);
  console.log(`   Length: ${content.length} characters`);

  // Split into chunks
  const chunks = chunkDocument(content);
  console.log(`   Chunks: ${chunks.length}`);

  // Generate embeddings and store
  const indexed = [];

  for (const chunk of chunks) {
    const embedding = await generateEmbedding(chunk.text);

    const doc = await knowledge.insert({
      id: `${source}-chunk-${chunk.index}`,
      content: chunk.text,
      source,
      embedding,
      chunkIndex: chunk.index,
      metadata
    });

    indexed.push(doc);
    process.stdout.write(`   Progress: ${indexed.length}/${chunks.length}\r`);
  }

  console.log(`\n   ✅ Indexed ${indexed.length} chunks`);
  return indexed;
}

/**
 * Batch index multiple documents
 */
async function indexDocuments(knowledge, documents) {
  console.log(`\n📖 Indexing ${documents.length} documents...\n`);

  const results = [];
  for (const doc of documents) {
    const indexed = await indexDocument(knowledge, doc);
    results.push(...indexed);
  }

  console.log(`\n✅ Total indexed: ${results.length} chunks from ${documents.length} documents`);
  return results;
}

// ============================================================================
// RAG Query & Response
// ============================================================================

/**
 * Search for relevant context using vector similarity
 */
async function retrieveContext(knowledge, query, options = {}) {
  const {
    topK = TOP_K,
    source = null,
    category = null,
    threshold = 0.7 // Only return similarity > 70%
  } = options;

  console.log(`\n🔍 Searching for: "${query}"`);

  // Generate query embedding
  const queryEmbedding = await generateEmbedding(query);

  // Search with optional filters
  const searchOptions = {
    limit: topK,
    distanceMetric: 'cosine',
    threshold: 1 - threshold // Convert similarity to distance
  };

  // Add partition filters if specified
  if (source) {
    searchOptions.partition = 'bySource';
    searchOptions.partitionValues = { source };
  } else if (category) {
    searchOptions.partition = 'byCategory';
    searchOptions.partitionValues = { 'metadata.category': category };
  }

  const results = await knowledge.vectorSearch(queryEmbedding, searchOptions);

  console.log(`   Found ${results.length} relevant chunks`);
  results.forEach(({ record, distance }, i) => {
    const similarity = (1 - distance) * 100;
    console.log(`   ${i + 1}. ${record.source} (chunk ${record.chunkIndex}) - ${similarity.toFixed(1)}% match`);
  });

  return results;
}

/**
 * Generate AI response with retrieved context
 */
async function generateResponse(query, context, options = {}) {
  const {
    model = CHAT_MODEL,
    temperature = 0.7,
    maxTokens = 500
  } = options;

  // Build context from retrieved chunks
  const contextText = context
    .map(({ record }, i) => `[${i + 1}] ${record.content}\nSource: ${record.source}`)
    .join('\n\n');

  // Create prompt with context
  const messages = [
    {
      role: 'system',
      content: `You are a helpful assistant that answers questions based on the provided context.
If the answer cannot be found in the context, say so clearly.
Always cite the source numbers [1], [2], etc. when using information from the context.`
    },
    {
      role: 'user',
      content: `Context:\n\n${contextText}\n\nQuestion: ${query}\n\nAnswer:`
    }
  ];

  console.log(`\n🤖 Generating response with ${model}...`);

  const response = await openai.chat.completions.create({
    model,
    messages,
    temperature,
    max_tokens: maxTokens
  });

  return {
    answer: response.choices[0].message.content,
    tokensUsed: response.usage.total_tokens,
    model: response.model
  };
}

/**
 * Complete RAG pipeline: retrieve + generate
 */
async function askQuestion(knowledge, query, options = {}) {
  const startTime = Date.now();

  // 1. Retrieve relevant context
  const context = await retrieveContext(knowledge, query, options);

  if (context.length === 0) {
    return {
      answer: "I couldn't find any relevant information in the knowledge base to answer your question.",
      sources: [],
      retrievalTime: Date.now() - startTime,
      generationTime: 0
    };
  }

  const retrievalTime = Date.now() - startTime;

  // 2. Generate response with context
  const generationStart = Date.now();
  const { answer, tokensUsed, model } = await generateResponse(query, context, options);
  const generationTime = Date.now() - generationStart;

  // 3. Extract unique sources
  const sources = [...new Set(context.map(c => c.record.source))];

  return {
    answer,
    sources,
    context: context.map(c => ({
      content: c.record.content,
      source: c.record.source,
      similarity: (1 - c.distance) * 100
    })),
    tokensUsed,
    model,
    retrievalTime,
    generationTime,
    totalTime: Date.now() - startTime
  };
}

// ============================================================================
// Demo Usage
// ============================================================================

async function demo() {
  console.log('🚀 RAG Chatbot Demo - s3db.js + OpenAI\n');
  console.log('=' .repeat(80));

  // Setup
  const { db, knowledge } = await setupDatabase();

  // Sample documents to index
  const documents = [
    {
      source: 's3db-overview.md',
      content: `s3db.js is a revolutionary document database that transforms AWS S3 into a fully functional database.
It uses S3's metadata capabilities to store document data in S3's metadata fields (up to 2KB), making it incredibly cost-effective.
The library provides an ORM-like interface with automatic encryption, schema validation, and partitioning support.
With the embedding shorthand notation, you can easily store vector embeddings with 77% compression using fixed-point encoding.`,
      metadata: { category: 'documentation', author: 's3db team' }
    },
    {
      source: 's3db-vectors.md',
      content: `The VectorPlugin enables semantic search, clustering, and similarity analysis using vector embeddings.
It supports multiple distance metrics (cosine, euclidean, manhattan) and k-means clustering with optimal K selection.
Use the clean embedding:1536 notation for OpenAI embeddings or embedding:768 for BERT/Sentence Transformers.
The plugin automatically applies 77% compression with fixed-point encoding, making it efficient for large-scale deployments.`,
      metadata: { category: 'documentation', author: 's3db team' }
    },
    {
      source: 'openai-embeddings.md',
      content: `OpenAI offers several embedding models. The text-embedding-3-small model produces 1536-dimensional vectors
and is optimized for cost and performance. The text-embedding-3-large model produces 3072-dimensional vectors
with higher quality but at increased cost. Both models support shortening embeddings to smaller dimensions
while maintaining strong performance. Embeddings are useful for search, clustering, recommendations, and anomaly detection.`,
      metadata: { category: 'ai-models', author: 'openai' }
    },
    {
      source: 'rag-best-practices.md',
      content: `RAG (Retrieval-Augmented Generation) combines information retrieval with language models for accurate responses.
Best practices include: chunking documents into 300-600 character segments, using hybrid search (keyword + vector),
implementing re-ranking for better results, and maintaining metadata for source attribution.
Always validate that retrieved context is relevant before generating responses to avoid hallucinations.`,
      metadata: { category: 'best-practices', author: 'ai community' }
    }
  ];

  // Index documents
  await indexDocuments(knowledge, documents);

  // Example queries
  console.log('\n\n' + '='.repeat(80));
  console.log('💬 Example Queries\n');

  const queries = [
    {
      question: 'What is s3db.js and what makes it cost-effective?',
      options: {}
    },
    {
      question: 'How do I use vector embeddings with s3db?',
      options: { category: 'documentation' }
    },
    {
      question: 'What are the best practices for RAG?',
      options: { topK: 3 }
    },
    {
      question: 'Tell me about OpenAI embedding models',
      options: { source: 'openai-embeddings.md' }
    }
  ];

  for (const { question, options } of queries) {
    console.log('\n' + '-'.repeat(80));
    console.log(`\n❓ Question: ${question}\n`);

    const result = await askQuestion(knowledge, question, options);

    console.log(`\n📝 Answer:\n${result.answer}\n`);
    console.log(`📚 Sources: ${result.sources.join(', ')}`);
    console.log(`⏱️  Timing: ${result.retrievalTime}ms retrieval + ${result.generationTime}ms generation = ${result.totalTime}ms total`);
    console.log(`🎫 Tokens: ${result.tokensUsed}`);
  }

  // Cleanup
  console.log('\n\n' + '='.repeat(80));
  console.log('✅ Demo complete!\n');
}

// ============================================================================
// Run Demo
// ============================================================================

if (import.meta.url === `file://${process.argv[1]}`) {
  demo().catch(console.error);
}

// ============================================================================
// Export for use as library
// ============================================================================

export {
  setupDatabase,
  indexDocument,
  indexDocuments,
  retrieveContext,
  generateResponse,
  askQuestion,
  generateEmbedding,
  chunkDocument
};
