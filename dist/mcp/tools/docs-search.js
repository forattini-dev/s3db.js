/**
 * Documentation Search Tools with Hybrid Search (Fuzzy + Semantic)
 * Provides separate tools for core docs and plugin docs.
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { HybridSearch, loadEmbeddings, EMBEDDING_TYPES, } from '../search/index.js'; // Import from TS version
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '../../');
/**
 * Cached search instances.
 */
const searchInstances = new Map();
/**
 * Embedder instance for generating query vectors.
 */
let embedder = null; // Type for EmbeddingModel
/**
 * Initializes the embedder if available.
 */
async function initEmbedder() {
    if (embedder !== null)
        return embedder;
    try {
        const { EmbeddingModel } = await import('fastembed');
        embedder = await EmbeddingModel.init({ model: 'BGE-small-en-v1.5' });
    }
    catch (err) {
        // fastembed not available, use fuzzy-only mode
        embedder = false;
    }
    return embedder;
}
/**
 * Gets or creates a HybridSearch instance for the given type.
 * @param type - 'core' or 'plugins'
 * @returns
 */
async function getSearchInstance(type) {
    if (searchInstances.has(type)) {
        return searchInstances.get(type);
    }
    const embeddings = await loadEmbeddings(type);
    const search = new HybridSearch(embeddings.documents || [], {
        fuzzyThreshold: 0.4,
        fuzzyWeight: 0.5,
        semanticWeight: 0.5,
    });
    searchInstances.set(type, search);
    return search;
}
/**
 * Generates query embedding vector.
 * @param query - Search query
 * @returns
 */
async function getQueryVector(query) {
    const emb = await initEmbedder();
    if (!emb)
        return null;
    try {
        const vectors = await emb.embed([query]);
        return vectors[0];
    }
    catch (err) {
        return null;
    }
}
/**
 * Performs hybrid search on documentation.
 * @param type - 'core' or 'plugins'
 * @param query - Search query
 * @param options - Search options
 * @returns
 */
async function searchDocs(type, query, options = {}) {
    const { limit = 5, minScore = 0.1 } = options;
    try {
        const search = await getSearchInstance(type);
        const queryVector = await getQueryVector(query);
        const results = search.search(query, queryVector, {
            limit,
            minScore,
        });
        // Enrich results with full file content if needed
        const enrichedResults = results.map(r => {
            let fullContent = r.content;
            // If content is truncated, try to load full file
            if (r.path && fullContent.length < 500) {
                try {
                    const fullPath = join(PROJECT_ROOT, r.path);
                    fullContent = readFileSync(fullPath, 'utf-8');
                }
                catch (err) {
                    // Keep original content
                }
            }
            return {
                ...r,
                fullContent: fullContent.length > 3000
                    ? fullContent.slice(0, 3000) + '\n\n... (truncated)'
                    : fullContent,
            };
        });
        const stats = search.getStats();
        const hasSemanticSearch = queryVector !== null;
        return {
            success: true,
            query,
            type,
            mode: hasSemanticSearch ? 'hybrid' : 'fuzzy-only',
            resultCount: enrichedResults.length,
            totalDocs: stats.totalDocuments,
            results: enrichedResults,
        };
    }
    catch (error) {
        return {
            success: false,
            query,
            type,
            error: error.message,
            suggestion: 'Try rephrasing your query or check if embeddings are built.',
        };
    }
}
/**
 * Lists all available documentation topics for a type.
 * @param type - 'core' or 'plugins'
 * @returns
 */
async function listTopics(type) {
    try {
        const search = await getSearchInstance(type);
        const stats = search.getStats();
        const docs = search.documents || [];
        // Group by path/section
        const topics = {};
        for (const doc of docs) {
            const basePath = doc.parentPath || doc.path;
            if (!topics[basePath]) {
                topics[basePath] = [];
            }
            if (doc.section) {
                topics[basePath].push(doc.section);
            }
        }
        return {
            success: true,
            type,
            totalDocuments: stats.totalDocuments,
            documentsWithVectors: stats.documentsWithVectors,
            topics: Object.entries(topics).map(([path, sections]) => ({
                path,
                sections: [...new Set(sections)],
            })),
        };
    }
    catch (error) {
        return {
            success: false,
            type,
            error: error.message,
        };
    }
}
/**
 * Tool definitions for MCP.
 */
export const docsSearchTools = [
    {
        name: 's3dbSearchCoreDocs',
        description: `Search s3db.js CORE documentation using hybrid search (fuzzy + semantic).
Core docs include: getting started, database/resource API, schema validation,
CRUD operations, partitioning, behaviors, encoding, encryption, streaming, and CLI.
Use this for questions about the main s3db.js functionality.`,
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Natural language search query (e.g., "how do partitions work", "create resource with validation")',
                },
                limit: {
                    type: 'number',
                    description: 'Maximum results to return (default: 5)',
                    default: 5,
                },
            },
            required: ['query'],
        },
    },
    {
        name: 's3dbSearchPluginDocs',
        description: `Search s3db.js PLUGIN documentation using hybrid search (fuzzy + semantic).
Plugin docs include: CachePlugin, AuditPlugin, ReplicatorPlugin, GeoPlugin,
MetricsPlugin, TTLPlugin, BackupPlugin, QueuePlugin, EventualConsistencyPlugin,
VectorPlugin, FulltextPlugin, ApiPlugin, and more.
Use this for questions about specific plugins and their configuration.`,
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Natural language search query (e.g., "cache plugin configuration", "how to use geo plugin")',
                },
                limit: {
                    type: 'number',
                    description: 'Maximum results to return (default: 5)',
                    default: 5,
                },
            },
            required: ['query'],
        },
    },
    {
        name: 's3dbListCoreTopics',
        description: 'List all available topics in s3db.js CORE documentation',
        inputSchema: {
            type: 'object',
            properties: {},
            required: [],
        },
    },
    {
        name: 's3dbListPluginTopics',
        description: 'List all available topics in s3db.js PLUGIN documentation',
        inputSchema: {
            type: 'object',
            properties: {},
            required: [],
        },
    },
];
/**
 * Creates handlers for the docs search tools.
 * @param server - MCP server instance
 * @returns Tool handlers
 */
export function createDocsSearchHandlers(server) {
    return {
        async s3dbSearchCoreDocs(args) {
            const { query, limit = 5 } = args;
            return searchDocs(EMBEDDING_TYPES.CORE, query, { limit });
        },
        async s3dbSearchPluginDocs(args) {
            const { query, limit = 5 } = args;
            return searchDocs(EMBEDDING_TYPES.PLUGINS, query, { limit });
        },
        async s3dbListCoreTopics(args) {
            return listTopics(EMBEDDING_TYPES.CORE);
        },
        async s3dbListPluginTopics(args) {
            return listTopics(EMBEDDING_TYPES.PLUGINS);
        },
    };
}
/**
 * Preloads search instances for faster first query.
 */
export async function preloadSearch() {
    await Promise.all([
        getSearchInstance(EMBEDDING_TYPES.CORE),
        getSearchInstance(EMBEDDING_TYPES.PLUGINS),
    ]);
}
export default {
    docsSearchTools,
    createDocsSearchHandlers,
    preloadSearch,
};
//# sourceMappingURL=docs-search.js.map