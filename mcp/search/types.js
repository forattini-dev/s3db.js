/**
 * Type definitions for MCP search
 * @module mcp/search/types
 */

/**
 * @typedef {Object} IndexedDoc
 * @property {string} id - Unique document identifier
 * @property {string} path - File path relative to project root
 * @property {string} title - Document title
 * @property {'core' | 'plugin'} category - Document category
 * @property {string[]} keywords - Extracted keywords
 * @property {string} content - Cleaned content for embedding
 * @property {string} [section] - Section heading if this is a chunk
 * @property {string} [parentPath] - Parent document path if this is a chunk
 */

/**
 * @typedef {Object} SearchResult
 * @property {string} id - Document identifier
 * @property {string} path - File path
 * @property {string} title - Document title
 * @property {string} content - Document content
 * @property {string} snippet - Relevant snippet from content
 * @property {number} score - Relevance score (0-1)
 * @property {'fuzzy' | 'semantic' | 'hybrid'} source - Search method that found this result
 */

/**
 * @typedef {Object} SearchOptions
 * @property {number} [limit=10] - Maximum number of results
 * @property {'core' | 'plugin'} [category] - Filter by category
 * @property {'hybrid' | 'fuzzy' | 'semantic'} [mode='hybrid'] - Search mode
 * @property {number} [minScore=0] - Minimum score threshold
 */

/**
 * @typedef {Object} HybridSearchConfig
 * @property {number} [fuzzyThreshold=0.3] - Fuse.js threshold (0=exact, 1=match anything)
 * @property {number} [fuzzyWeight=0.5] - Weight for fuzzy search results
 * @property {number} [semanticWeight=0.5] - Weight for semantic search results
 * @property {boolean} [debug=false] - Enable debug logging
 */

/**
 * @typedef {Object} EmbeddingEntry
 * @property {string} id - Document identifier
 * @property {string} path - File path
 * @property {string} title - Document title
 * @property {'core' | 'plugin'} category - Document category
 * @property {string[]} keywords - Extracted keywords
 * @property {string} [section] - Section heading
 * @property {string} [parentPath] - Parent document path
 * @property {number[]} vector - Embedding vector
 */

/**
 * @typedef {Object} EmbeddingsData
 * @property {string} version - Embeddings format version
 * @property {string} model - Model used to generate embeddings
 * @property {number} dimensions - Vector dimensions
 * @property {string} generatedAt - ISO timestamp
 * @property {EmbeddingEntry[]} documents - Document embeddings
 */

export {};
