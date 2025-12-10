import { readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '../..');
const DOCUMENTATION_INDEX = {
    // Core concepts
    'getting started': ['README.md', 'docs/schema.md'],
    'installation': ['README.md'],
    'connection': ['docs/client.md', 'CLAUDE.md'],
    'database': ['CLAUDE.md', 'docs/schema.md'],
    'resource': ['CLAUDE.md', 'docs/schema.md'],
    'schema': ['docs/schema.md', 'CLAUDE.md'],
    'validation': ['docs/schema.md', 'CLAUDE.md'],
    // Data operations
    'insert': ['CLAUDE.md'],
    'update': ['CLAUDE.md'],
    'delete': ['CLAUDE.md'],
    'query': ['CLAUDE.md'],
    'list': ['CLAUDE.md'],
    'get': ['CLAUDE.md'],
    'count': ['CLAUDE.md'],
    'crud': ['CLAUDE.md'],
    // Partitioning
    'partition': ['CLAUDE.md', 'docs/benchmarks/partitions.md'],
    'partitioning': ['CLAUDE.md', 'docs/benchmarks/partitions.md'],
    'orphaned partition': ['CLAUDE.md'],
    'partition migration': ['CLAUDE.md', 'docs/mcp.md'],
    // Plugins
    'plugin': ['docs/plugins/README.md', 'CLAUDE.md'],
    'cache': ['docs/plugins/cache.md', 'CLAUDE.md'],
    'caching': ['docs/plugins/cache.md', 'CLAUDE.md'],
    'audit': ['docs/plugins/audit.md', 'CLAUDE.md'],
    'replicator': ['docs/plugins/replicator.md', 'CLAUDE.md'],
    'backup': ['docs/plugins/backup.md', 'CLAUDE.md'],
    'geo': ['docs/plugins/geo.md', 'CLAUDE.md'],
    'geospatial': ['docs/plugins/geo.md', 'CLAUDE.md'],
    'location': ['docs/plugins/geo.md'],
    'metrics': ['docs/plugins/metrics.md', 'CLAUDE.md'],
    'costs': ['docs/plugins/costs.md', 'CLAUDE.md'],
    'eventual consistency': ['docs/plugins/eventual-consistency.md', 'CLAUDE.md'],
    'fulltext': ['docs/plugins/fulltext.md'],
    'search': ['docs/plugins/fulltext.md'],
    'queue': ['docs/plugins/queue-consumer.md', 'docs/plugins/s3-queue.md'],
    // Performance & Optimization
    'performance': ['CLAUDE.md', 'docs/benchmarks/README.md'],
    'optimization': ['CLAUDE.md', 'docs/benchmarks/README.md'],
    'benchmark': ['docs/benchmarks/README.md'],
    'compression': ['CLAUDE.md'],
    'encoding': ['CLAUDE.md', 'docs/benchmarks/smart-encoding.md'],
    // MCP specific
    'mcp': ['docs/mcp.md'],
    'model context protocol': ['docs/mcp.md'],
    'ai agent': ['docs/mcp.md'],
    'claude desktop': ['docs/mcp.md'],
    // Advanced features
    'encryption': ['CLAUDE.md'],
    'secret': ['CLAUDE.md'],
    'vector': ['docs/plugins/vector.md'],
    'embedding': ['CLAUDE.md', 'docs/plugins/vector.md'],
    'versioning': ['CLAUDE.md'],
    'hooks': ['CLAUDE.md'],
    'behavior': ['CLAUDE.md'],
    'metadata': ['CLAUDE.md'],
    // Troubleshooting
    'error': ['CLAUDE.md', 'docs/mcp.md'],
    'troubleshooting': ['docs/mcp.md'],
    'recovery': ['CLAUDE.md']
};
/**
 * Get all markdown files in docs directory
 */
function getAllDocFiles() {
    const files = [];
    function walkDir(dir) {
        try {
            const items = readdirSync(dir);
            for (const item of items) {
                const fullPath = join(dir, item);
                try {
                    const stat = statSync(fullPath);
                    if (stat.isDirectory()) {
                        walkDir(fullPath);
                    }
                    else if (item.endsWith('.md')) {
                        const relativePath = fullPath.replace(PROJECT_ROOT + '/', '');
                        files.push(relativePath);
                    }
                }
                catch (err) {
                    // Skip files we can't access
                    continue;
                }
            }
        }
        catch (err) {
            // Skip directories we can't access
            return;
        }
    }
    walkDir(join(PROJECT_ROOT, 'docs'));
    // Add root-level important docs
    try {
        ['README.md', 'CLAUDE.md'].forEach(file => {
            const fullPath = join(PROJECT_ROOT, file);
            try {
                if (statSync(fullPath).isFile()) {
                    files.push(file);
                }
            }
            catch (err) {
                // Skip if file doesn't exist
            }
        });
    }
    catch (err) {
        // Skip if error accessing root files
    }
    return files;
}
/**
 * Search for query terms in documentation
 */
function searchDocumentation(query) {
    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(/\s+/).filter(t => t.length > 2);
    // Find relevant files from index
    const relevantFiles = new Set();
    // Check index first
    for (const [topic, files] of Object.entries(DOCUMENTATION_INDEX)) {
        if (queryLower.includes(topic) || queryTerms.some(term => topic.includes(term))) {
            files.forEach(f => relevantFiles.add(f));
        }
    }
    // If no matches in index, search all docs
    if (relevantFiles.size === 0) {
        getAllDocFiles().forEach(f => relevantFiles.add(f));
    }
    const results = [];
    for (const filePath of relevantFiles) {
        try {
            const fullPath = join(PROJECT_ROOT, filePath);
            const content = readFileSync(fullPath, 'utf-8');
            // Calculate relevance score
            let score = 0;
            const contentLower = content.toLowerCase();
            // Exact query match
            if (contentLower.includes(queryLower)) {
                score += 100;
            }
            // Individual term matches
            queryTerms.forEach(term => {
                const regex = new RegExp(`\b${term}\b`, 'gi');
                const matches = contentLower.match(regex);
                if (matches) {
                    score += matches.length * 10;
                }
            });
            // Boost for certain file types
            if (filePath === 'CLAUDE.md')
                score *= 1.5;
            if (filePath.includes('plugins/'))
                score *= 1.2;
            if (score > 0) {
                // Extract relevant sections
                const sections = extractRelevantSections(content, queryTerms, filePath);
                results.push({
                    file: filePath,
                    score,
                    sections
                });
            }
        }
        catch (error) {
            // Skip files that can't be read
            continue;
        }
    }
    // Sort by relevance
    results.sort((a, b) => b.score - a.score);
    return results;
}
/**
 * Extract relevant sections from markdown content
 */
function extractRelevantSections(content, queryTerms, filePath) {
    const lines = content.split('\n');
    const sections = [];
    let currentSection = null;
    let currentContent = [];
    let sectionScore = 0;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Detect section headers
        if (line.match(/^#{1,4}\s/)) {
            // Save previous section if it has content
            if (currentSection && currentContent.length > 0 && sectionScore > 0) {
                sections.push({
                    header: currentSection,
                    content: currentContent.join('\n').trim(),
                    score: sectionScore
                });
            }
            // Start new section
            currentSection = line;
            currentContent = [line];
            sectionScore = 0;
            // Score the header
            const headerLower = line.toLowerCase();
            queryTerms.forEach(term => {
                if (headerLower.includes(term)) {
                    sectionScore += 50;
                }
            });
        }
        else if (currentSection) {
            currentContent.push(line);
            // Score the content
            const lineLower = line.toLowerCase();
            queryTerms.forEach(term => {
                if (lineLower.includes(term)) {
                    sectionScore += 5;
                }
            });
        }
    }
    // Save last section
    if (currentSection && currentContent.length > 0 && sectionScore > 0) {
        sections.push({
            header: currentSection,
            content: currentContent.join('\n').trim(),
            score: sectionScore
        });
    }
    // Sort sections by score and limit
    sections.sort((a, b) => b.score - a.score);
    // Return top sections (limit to avoid huge responses)
    return sections.slice(0, 3);
}
/**
 * Format search results for display
 */
function formatResults(results, query, maxResults = 5) {
    if (results.length === 0) {
        return {
            query,
            found: false,
            message: 'No documentation found for this query. Try rephrasing or asking about: plugins, cache, partitions, schema, CRUD operations, or MCP integration.',
            suggestions: [
                'How do I use the CachePlugin?',
                'What are partitions and when should I use them?',
                'How do I create a resource with schema validation?',
                'How does the MCP server work?',
                'What plugins are available?'
            ]
        };
    }
    const topResults = results.slice(0, maxResults);
    const formatted = {
        query,
        found: true,
        resultCount: results.length,
        showing: topResults.length,
        results: []
    };
    for (const result of topResults) {
        const formattedResult = {
            file: result.file,
            relevanceScore: result.score,
            sections: []
        };
        for (const section of result.sections) {
            // Limit section content length
            let content = section.content;
            if (content.length > 1500) {
                content = content.substring(0, 1500) + '\n\n... (truncated)';
            }
            formattedResult.sections.push({
                header: section.header,
                content: content
            });
        }
        formatted.results.push(formattedResult);
    }
    return formatted;
}
export const documentationTools = [
    {
        name: 's3dbQueryDocs',
        description: 'Search s3db.js documentation to answer questions about features, plugins, best practices, and usage. Use this tool to help AI agents understand how to use s3db.js effectively.',
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Natural language question about s3db.js (e.g., "How do I use GeoPlugin?", "What is the best caching strategy?", "How do partitions work?")'
                },
                maxResults: {
                    type: 'number',
                    description: 'Maximum number of documentation files to return',
                    default: 5
                }
            },
            required: ['query']
        }
    },
    {
        name: 's3dbListTopics',
        description: 'List all available documentation topics and their categories',
        inputSchema: {
            type: 'object',
            properties: {},
            required: []
        }
    }
];
export function createDocumentationHandlers(server) {
    return {
        async s3dbQueryDocs(args) {
            const { query, maxResults = 5 } = args;
            try {
                const results = searchDocumentation(query);
                const formatted = formatResults(results, query, maxResults);
                return {
                    success: true,
                    ...formatted
                };
            }
            catch (error) {
                return {
                    success: false,
                    query,
                    error: error.message,
                    suggestion: 'Try rephrasing your question or use s3dbListTopics to see available topics'
                };
            }
        },
        async s3dbListTopics(args) {
            const topics = {};
            // Organize by category
            topics.core = ['getting started', 'installation', 'connection', 'database', 'resource', 'schema', 'validation'];
            topics.operations = ['insert', 'update', 'delete', 'query', 'list', 'get', 'count', 'crud'];
            topics.partitioning = ['partition', 'partitioning', 'orphaned partition', 'partition migration'];
            topics.plugins = ['plugin', 'cache', 'audit', 'replicator', 'backup', 'geo', 'metrics', 'costs', 'eventual consistency', 'fulltext', 'queue'];
            topics.performance = ['performance', 'optimization', 'benchmark', 'compression', 'encoding'];
            topics.mcp = ['mcp', 'model context protocol', 'ai agent', 'claude desktop'];
            topics.advanced = ['encryption', 'secret', 'vector', 'embedding', 'versioning', 'hooks', 'behavior', 'metadata'];
            topics.troubleshooting = ['error', 'troubleshooting', 'recovery'];
            const allFiles = getAllDocFiles();
            return {
                success: true,
                message: 'Use s3dbQueryDocs with any of these topics to get detailed documentation',
                categories: topics,
                availableFiles: allFiles,
                totalTopics: Object.keys(DOCUMENTATION_INDEX).length,
                totalFiles: allFiles.length,
                examples: [
                    {
                        query: 'How do I use the CachePlugin?',
                        description: 'Learn about caching strategies and configuration'
                    },
                    {
                        query: 'What are partitions?',
                        description: 'Understand partitioning for performance optimization'
                    },
                    {
                        query: 'How do I handle orphaned partitions?',
                        description: 'Recovery workflow for partition issues'
                    },
                    {
                        query: 'What plugins are available?',
                        description: 'Complete list of available plugins and their purposes'
                    },
                    {
                        query: 'How does MCP integration work?',
                        description: 'Setting up and using the MCP server with AI agents'
                    }
                ]
            };
        }
    };
}
//# sourceMappingURL=documentation.js.map