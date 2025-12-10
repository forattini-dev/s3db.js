/**
 * Hybrid search combining fuzzy text matching with semantic vector search.
 * Uses Reciprocal Rank Fusion (RRF) to combine results.
 */
import type { SearchResult, SearchOptions, HybridSearchConfig, EmbeddingEntry } from './types.js';
export declare class HybridSearch {
    private config;
    private documents;
    private fuseIndex;
    /**
     * @param documents - Documents with embeddings
     * @param config - Search configuration
     */
    constructor(documents: EmbeddingEntry[], config?: HybridSearchConfig);
    /**
     * Performs hybrid search combining fuzzy and semantic results.
     * @param query - Search query
     * @param queryVector - Pre-computed query embedding vector
     * @param options - Search options
     * @returns - Ranked search results
     */
    search(query: string, queryVector?: number[] | null, options?: SearchOptions): SearchResult[];
    /**
     * Performs fuzzy-only search.
     * @param query - Search query
     * @param options - Search options
     * @returns - Search results
     */
    fuzzySearch(query: string, options?: SearchOptions): SearchResult[];
    /**
     * Performs semantic-only search.
     * @param queryVector - Query embedding vector
     * @param options - Search options
     * @returns - Search results
     */
    semanticSearch(queryVector: number[], options?: SearchOptions): SearchResult[];
    /**
     * Internal fuzzy search implementation.
     * @private
     */
    private _fuzzySearch;
    /**
     * Internal semantic search implementation.
     * @private
     */
    private _semanticSearch;
    /**
     * Combines fuzzy and semantic results using RRF.
     * @private
     */
    private _combineResults;
    /**
     * Formats a result for output.
     * @private
     */
    private _formatResult;
    /**
     * Extracts a relevant snippet from content.
     * @private
     */
    private _extractSnippet;
    /**
     * Gets statistics about the search index.
     * @returns Index statistics
     */
    getStats(): {
        totalDocuments: number;
        documentsWithVectors: number;
        categories: string[];
        config: Required<HybridSearchConfig>;
    };
}
export default HybridSearch;
//# sourceMappingURL=hybrid-search.d.ts.map