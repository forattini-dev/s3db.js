/**
 * Embeddings loader with lazy loading and caching.
 * Loads pre-computed embeddings from local files or GitHub Releases.
 */
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
/**
 * Default configuration for embeddings loader.
 */
const DEFAULT_CONFIG = {
    cacheDir: join(__dirname, '..', 'data'),
    githubRepo: 'Forattini-dev/s3db.js',
    maxCacheAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};
/**
 * Embedding types available.
 */
export const EMBEDDING_TYPES = {
    CORE: 'core',
    PLUGINS: 'plugins',
};
/**
 * In-memory cache for loaded embeddings.
 */
const memoryCache = new Map();
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
export async function loadEmbeddings(type, options = {}) {
    const config = { ...DEFAULT_CONFIG, ...options };
    const cacheKey = `embeddings-${type}`;
    // Check memory cache first
    if (!config.forceRefresh && memoryCache.has(cacheKey)) {
        return memoryCache.get(cacheKey);
    }
    const filename = `embeddings-${type}.json`;
    const localPath = join(config.cacheDir, filename);
    // Try loading from local file
    try {
        const localData = await loadFromFile(localPath);
        if (localData && !config.forceRefresh) {
            // Check if cache is still valid
            const cacheAge = Date.now() - new Date(localData.generatedAt).getTime();
            if (cacheAge < config.maxCacheAge) {
                memoryCache.set(cacheKey, localData);
                return localData;
            }
        }
    }
    catch (err) {
        // Local file not found, continue to remote
    }
    // Try loading from GitHub Releases
    try {
        const remoteData = await loadFromGitHub(config.githubRepo, filename);
        if (remoteData) {
            // Cache locally
            await cacheToFile(localPath, remoteData);
            memoryCache.set(cacheKey, remoteData);
            return remoteData;
        }
    }
    catch (err) {
        console.warn(`[EmbeddingsLoader] Failed to load from GitHub: ${err.message}`);
    }
    // Return empty embeddings if nothing found
    const emptyData = createEmptyEmbeddings(type);
    memoryCache.set(cacheKey, emptyData);
    return emptyData;
}
/**
 * Loads embeddings from a local file.
 * @param filePath - Path to embeddings file
 * @returns
 */
async function loadFromFile(filePath) {
    try {
        const content = await readFile(filePath, 'utf-8');
        return JSON.parse(content);
    }
    catch (err) {
        if (err.code !== 'ENOENT') {
            console.warn(`[EmbeddingsLoader] Error reading ${filePath}: ${err.message}`);
        }
        return null;
    }
}
/**
 * Loads embeddings from GitHub Releases.
 * @param repo - GitHub repository (owner/name)
 * @param filename - Asset filename
 * @returns
 */
async function loadFromGitHub(repo, filename) {
    // Get latest release
    const releaseUrl = `https://api.github.com/repos/${repo}/releases/latest`;
    const releaseRes = await fetch(releaseUrl, {
        headers: { 'Accept': 'application/vnd.github.v3+json' },
    });
    if (!releaseRes.ok) {
        throw new Error(`Failed to fetch release info: ${releaseRes.status}`);
    }
    const release = await releaseRes.json();
    const asset = release.assets?.find((a) => a.name === filename);
    if (!asset) {
        throw new Error(`Asset ${filename} not found in release ${release.tag_name}`);
    }
    // Download asset
    const assetRes = await fetch(asset.browser_download_url);
    if (!assetRes.ok) {
        throw new Error(`Failed to download asset: ${assetRes.status}`);
    }
    return await assetRes.json();
}
/**
 * Caches embeddings to a local file.
 * @param filePath - Path to cache file
 * @param data - Embeddings data to cache
 */
async function cacheToFile(filePath, data) {
    try {
        await mkdir(dirname(filePath), { recursive: true });
        await writeFile(filePath, JSON.stringify(data, null, 2));
    }
    catch (err) {
        console.warn(`[EmbeddingsLoader] Failed to cache to ${filePath}: ${err.message}`);
    }
}
/**
 * Creates empty embeddings data.
 * @param type - Embedding type
 * @returns
 */
function createEmptyEmbeddings(type) {
    return {
        version: '1.0.0',
        model: 'none',
        dimensions: 0,
        generatedAt: new Date().toISOString(),
        documents: [],
    };
}
/**
 * Loads both core and plugins embeddings.
 * @param options - Loader options
 * @returns
 */
export async function loadAllEmbeddings(options = {}) {
    const [core, plugins] = await Promise.all([
        loadEmbeddings(EMBEDDING_TYPES.CORE, options),
        loadEmbeddings(EMBEDDING_TYPES.PLUGINS, options),
    ]);
    return { core, plugins };
}
/**
 * Clears the in-memory cache.
 */
export function clearCache() {
    memoryCache.clear();
}
/**
 * Gets cache statistics.
 * @returns Cache stats
 */
export function getCacheStats() {
    const stats = {
        entriesInMemory: memoryCache.size,
        types: [],
    };
    for (const [key, data] of memoryCache.entries()) {
        stats.types.push({
            key,
            documents: data.documents?.length || 0,
            model: data.model,
            generatedAt: data.generatedAt,
        });
    }
    return stats;
}
/**
 * Preloads embeddings into memory cache.
 * Useful for warming up the cache on startup.
 * @param options - Loader options
 */
export async function preloadEmbeddings(options = {}) {
    await loadAllEmbeddings(options);
}
export default {
    loadEmbeddings,
    loadAllEmbeddings,
    clearCache,
    getCacheStats,
    preloadEmbeddings,
    EMBEDDING_TYPES,
};
//# sourceMappingURL=embeddings-loader.js.map