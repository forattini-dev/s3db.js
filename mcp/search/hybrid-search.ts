/**
 * Hybrid search combining fuzzy text matching with semantic vector search.
 * Uses Reciprocal Rank Fusion (RRF) to combine results.
 */

import Fuse from 'fuse.js';
import { cosineSimilarity, combineScores } from './math.js'; // Assuming stringSimilarity is used internally

import type { IndexedDoc, SearchResult, SearchOptions, HybridSearchConfig, EmbeddingEntry } from './types.js';

/**
 * Default configuration for hybrid search.
 */
const DEFAULT_CONFIG: HybridSearchConfig = {
  fuzzyThreshold: 0.4,
  fuzzyWeight: 0.5,
  semanticWeight: 0.5,
  debug: false,
};

/**
 * Fuse.js configuration for fuzzy search.
 */
const FUSE_OPTIONS = {
  keys: [
    { name: 'title', weight: 0.4 },
    { name: 'keywords', weight: 0.35 },
    { name: 'content', weight: 0.25 },
  ],
  threshold: 0.4,
  includeScore: true,
  ignoreLocation: true,
  minMatchCharLength: 2,
};

export class HybridSearch {
  private config: Required<HybridSearchConfig>;
  private documents: EmbeddingEntry[];
  private fuseIndex: Fuse<EmbeddingEntry>;

  /**
   * @param documents - Documents with embeddings
   * @param config - Search configuration
   */
  constructor(documents: EmbeddingEntry[], config: HybridSearchConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config } as Required<HybridSearchConfig>;
    this.documents = documents;

    // Build Fuse.js index for fuzzy search
    this.fuseIndex = new Fuse(documents, {
      ...FUSE_OPTIONS,
      threshold: this.config.fuzzyThreshold,
    });

    if (this.config.debug) {
      console.log(`[HybridSearch] Indexed ${documents.length} documents`);
    }
  }

  /**
   * Performs hybrid search combining fuzzy and semantic results.
   * @param query - Search query
   * @param queryVector - Pre-computed query embedding vector
   * @param options - Search options
   * @returns - Ranked search results
   */
  search(query: string, queryVector: number[] | null = null, options: SearchOptions = {}): SearchResult[] {
    const { limit = 10, category, minScore = 0 } = options;

    // Filter documents by category if specified
    let searchDocs = this.documents;
    if (category) {
      searchDocs = this.documents.filter(d => d.category === category);
    }

    // Get fuzzy results
    const fuzzyResults = this._fuzzySearch(query, searchDocs);

    // Get semantic results if vector provided
    let semanticResults: { doc: EmbeddingEntry; score: number; source: 'semantic' }[] = [];
    if (queryVector && queryVector.length > 0) {
      semanticResults = this._semanticSearch(queryVector, searchDocs);
    }

    // Combine results using RRF
    const combined = this._combineResults(fuzzyResults, semanticResults);

    // Filter by minimum score and limit
    return combined
      .filter(r => r.score >= minScore)
      .slice(0, limit)
      .map(r => this._formatResult(r, query));
  }

  /**
   * Performs fuzzy-only search.
   * @param query - Search query
   * @param options - Search options
   * @returns - Search results
   */
  fuzzySearch(query: string, options: SearchOptions = {}): SearchResult[] {
    const { limit = 10, category, minScore = 0 } = options;

    let searchDocs = this.documents;
    if (category) {
      searchDocs = this.documents.filter(d => d.category === category);
    }

    const results = this._fuzzySearch(query, searchDocs);

    return results
      .filter(r => r.score >= minScore)
      .slice(0, limit)
      .map(r => this._formatResult(r, query, 'fuzzy'));
  }

  /**
   * Performs semantic-only search.
   * @param queryVector - Query embedding vector
   * @param options - Search options
   * @returns - Search results
   */
  semanticSearch(queryVector: number[], options: SearchOptions = {}): SearchResult[] {
    const { limit = 10, category, minScore = 0 } = options;

    let searchDocs = this.documents;
    if (category) {
      searchDocs = this.documents.filter(d => d.category === category);
    }

    const results = this._semanticSearch(queryVector, searchDocs);

    return results
      .filter(r => r.score >= minScore)
      .slice(0, limit)
      .map(r => this._formatResult(r, '', 'semantic'));
  }

  /**
   * Internal fuzzy search implementation.
   * @private
   */
  private _fuzzySearch(query: string, documents: EmbeddingEntry[]): { doc: EmbeddingEntry; score: number; source: 'fuzzy' }[] {
    // Create temporary Fuse index for filtered documents
    const fuse = documents === this.documents
      ? this.fuseIndex
      : new Fuse(documents, { ...FUSE_OPTIONS, threshold: this.config.fuzzyThreshold });

    const results = fuse.search(query);

    return results.map(r => ({
      doc: r.item,
      score: 1 - (r.score || 0), // Fuse score is inverse (0 = perfect)
      source: 'fuzzy',
    }));
  }

  /**
   * Internal semantic search implementation.
   * @private
   */
  private _semanticSearch(queryVector: number[], documents: EmbeddingEntry[]): { doc: EmbeddingEntry; score: number; source: 'semantic' }[] {
    const results = documents
      .filter(doc => doc.vector && doc.vector.length > 0)
      .map(doc => ({
        doc,
        score: cosineSimilarity(queryVector, doc.vector!),
        source: 'semantic',
      }))
      .sort((a, b) => b.score - a.score);

    // Normalize scores to 0-1 range
    if (results.length > 0) {
      const maxScore = results[0].score;
      const minScore = results[results.length - 1].score;
      const range = maxScore - minScore || 1;

      results.forEach(r => {
        r.score = (r.score - minScore) / range;
      });
    }

    return results;
  }

  /**
   * Combines fuzzy and semantic results using RRF.
   * @private
   */
  private _combineResults(
    fuzzyResults: { doc: EmbeddingEntry; score: number; source: 'fuzzy' }[],
    semanticResults: { doc: EmbeddingEntry; score: number; source: 'semantic' }[]
  ): { doc: EmbeddingEntry; score: number; fuzzyScore: number; semanticScore: number; source: 'hybrid' }[] {
    const scoreMap = new Map<string, {
      doc: EmbeddingEntry;
      fuzzyScore: number;
      fuzzyRank: number;
      semanticScore: number;
      semanticRank: number;
    }>();

    // Add fuzzy scores
    fuzzyResults.forEach((r, index) => {
      const id = r.doc.id;
      scoreMap.set(id, {
        doc: r.doc,
        fuzzyScore: r.score,
        fuzzyRank: index + 1,
        semanticScore: 0,
        semanticRank: Infinity,
      });
    });

    // Add semantic scores
    semanticResults.forEach((r, index) => {
      const id = r.doc.id;
      if (scoreMap.has(id)) {
        const entry = scoreMap.get(id)!;
        entry.semanticScore = r.score;
        entry.semanticRank = index + 1;
      } else {
        scoreMap.set(id, {
          doc: r.doc,
          fuzzyScore: 0,
          fuzzyRank: Infinity,
          semanticScore: r.score,
          semanticRank: index + 1,
        });
      }
    });

    // Calculate combined scores using RRF
    const combined = Array.from(scoreMap.values()).map(entry => {
      let score: number;

      if (semanticResults.length === 0) {
        // Fuzzy only mode
        score = entry.fuzzyScore;
      } else if (fuzzyResults.length === 0) {
        // Semantic only mode
        score = entry.semanticScore;
      } else {
        // Hybrid mode - use weighted combination
        score = combineScores(
          entry.fuzzyScore * this.config.fuzzyWeight,
          entry.semanticScore * this.config.semanticWeight
        );
      }

      return {
        doc: entry.doc,
        score,
        fuzzyScore: entry.fuzzyScore,
        semanticScore: entry.semanticScore,
        source: 'hybrid',
      };
    });

    // Sort by combined score
    return combined.sort((a, b) => b.score - a.score);
  }

  /**
   * Formats a result for output.
   * @private
   */
  private _formatResult(result: { doc: EmbeddingEntry; score: number; fuzzyScore?: number; semanticScore?: number; source: 'fuzzy' | 'semantic' | 'hybrid' }, query: string, sourceOverride: 'fuzzy' | 'semantic' | 'hybrid' | null = null): SearchResult {
    const { doc, score, fuzzyScore, semanticScore } = result;

    return {
      id: doc.id,
      path: doc.path,
      title: doc.title,
      content: doc.content || '',
      snippet: this._extractSnippet(doc.content || '', query),
      score,
      source: sourceOverride || result.source,
      ...(this.config.debug && {
        debug: { fuzzyScore, semanticScore },
      }),
    };
  }

  /**
   * Extracts a relevant snippet from content.
   * @private
   */
  private _extractSnippet(content: string, query: string, maxLength: number = 200): string {
    if (!content || !query) {
      return content?.slice(0, maxLength) || '';
    }

    const lowerContent = content.toLowerCase();
    const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);

    // Find best matching position
    let bestPos = 0;
    let bestScore = 0;

    for (const term of queryTerms) {
      const pos = lowerContent.indexOf(term);
      if (pos !== -1) {
        // Count how many terms are near this position
        let score = 0;
        for (const t of queryTerms) {
          const tPos = lowerContent.indexOf(t, Math.max(0, pos - 100));
          if (tPos !== -1 && tPos < pos + 100) {
            score++;
          }
        }
        if (score > bestScore) {
          bestScore = score;
          bestPos = pos;
        }
      }
    }

    // Extract snippet around best position
    const start = Math.max(0, bestPos - 50);
    const end = Math.min(content.length, start + maxLength);
    let snippet = content.slice(start, end);

    // Clean up snippet boundaries
    if (start > 0) {
      const firstSpace = snippet.indexOf(' ');
      if (firstSpace > 0 && firstSpace < 20) {
        snippet = '...' + snippet.slice(firstSpace + 1);
      }
    }
    if (end < content.length) {
      const lastSpace = snippet.lastIndexOf(' ');
      if (lastSpace > snippet.length - 20) {
        snippet = snippet.slice(0, lastSpace) + '...';
      }
    }

    return snippet.trim();
  }

  /**
   * Gets statistics about the search index.
   * @returns Index statistics
   */
  getStats(): { totalDocuments: number; documentsWithVectors: number; categories: string[]; config: Required<HybridSearchConfig> } {
    const withVectors = this.documents.filter(d => d.vector?.length > 0).length;
    const categories = [...new Set(this.documents.map(d => d.category))];

    return {
      totalDocuments: this.documents.length,
      documentsWithVectors: withVectors,
      categories,
      config: this.config,
    };
  }
}

export default HybridSearch;
