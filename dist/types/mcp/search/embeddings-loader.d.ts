/**
 * Embeddings loader with lazy loading and caching.
 * Loads pre-computed embeddings from local files or GitHub Releases.
 */
import type { EmbeddingsData } from './types.js';
/**
 * Embedding types available.
 */
export declare const EMBEDDING_TYPES: {
    CORE: string;
    PLUGINS: string;
};
/**
 * Loads embeddings for a specific type.
 * Tries local file first, then falls back to GitHub Releases.
 *
 * @param type - Embedding type ('core' or 'plugins')
 * @param options - Loader options
 * @param options.cacheDir - Cache directory
 * @param options.forceRefresh - Force refresh from remote
 * @returns - Loaded embeddings data
 */
export declare function loadEmbeddings(type: string, options?: {
    cacheDir?: string;
    forceRefresh?: boolean;
}): Promise<EmbeddingsData>;
/**
 * Loads both core and plugins embeddings.
 * @param options - Loader options
 * @returns
 */
export declare function loadAllEmbeddings(options?: {
    cacheDir?: string;
    forceRefresh?: boolean;
}): Promise<{
    core: EmbeddingsData;
    plugins: EmbeddingsData;
}>;
/**
 * Clears the in-memory cache.
 */
export declare function clearCache(): void;
/**
 * Gets cache statistics.
 * @returns Cache stats
 */
export declare function getCacheStats(): any;
/**
 * Preloads embeddings into memory cache.
 * Useful for warming up the cache on startup.
 * @param options - Loader options
 */
export declare function preloadEmbeddings(options?: {
    cacheDir?: string;
    forceRefresh?: boolean;
}): Promise<void>;
declare const _default: {
    loadEmbeddings: typeof loadEmbeddings;
    loadAllEmbeddings: typeof loadAllEmbeddings;
    clearCache: typeof clearCache;
    getCacheStats: typeof getCacheStats;
    preloadEmbeddings: typeof preloadEmbeddings;
    EMBEDDING_TYPES: {
        CORE: string;
        PLUGINS: string;
    };
};
export default _default;
//# sourceMappingURL=embeddings-loader.d.ts.map