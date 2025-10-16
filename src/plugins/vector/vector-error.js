/**
 * Vector Plugin Error Class
 */

import { PluginError } from '../../errors.js';

/**
 * VectorError class for vector-related errors
 *
 * @extends PluginError
 */
export class VectorError extends PluginError {
  constructor(message, details = {}) {
    super(message, {
      pluginName: 'VectorPlugin',
      ...details,
      description: details.description || `
Vector Plugin Error

Operation: ${details.operation || 'unknown'}

Common causes:
1. Vector dimension mismatch between vectors
2. Invalid distance metric specified (must be: cosine, euclidean, manhattan)
3. Empty vector array provided for clustering
4. k value larger than number of available vectors
5. Vector field not found or invalid in resource
6. Large vectors without proper behavior (use 'body-overflow' or 'body-only')

Available distance metrics:
- cosine: Best for normalized vectors, semantic similarity. Range: [0, 2]
- euclidean: Standard L2 distance, geometric proximity. Range: [0, ∞)
- manhattan: L1 distance, faster computation. Range: [0, ∞)

Storage considerations:
- Vectors > 250 dimensions may exceed S3 metadata limit (2KB)
- Use behavior: 'body-overflow' or 'body-only' for large vectors
- OpenAI ada-002 (1536 dims): ~10KB, requires body storage
- Sentence Transformers (384 dims): ~2.7KB, requires body storage
      `.trim()
    });
  }
}
