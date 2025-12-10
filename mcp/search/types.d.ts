/**
 * Type definitions for MCP search
 */
export interface IndexedDoc {
    id: string;
    path: string;
    title: string;
    category: 'core' | 'plugin';
    keywords: string[];
    content: string;
    section?: string;
    parentPath?: string;
}
export interface SearchResult {
    id: string;
    path: string;
    title: string;
    content: string;
    snippet: string;
    score: number;
    source: 'fuzzy' | 'semantic' | 'hybrid';
    fullContent?: string;
}
export interface SearchOptions {
    limit?: number;
    category?: 'core' | 'plugin';
    mode?: 'hybrid' | 'fuzzy' | 'semantic';
    minScore?: number;
}
export interface HybridSearchConfig {
    fuzzyThreshold?: number;
    fuzzyWeight?: number;
    semanticWeight?: number;
    debug?: boolean;
}
export interface EmbeddingEntry {
    id: string;
    path: string;
    title: string;
    category: 'core' | 'plugin';
    keywords: string[];
    section?: string;
    parentPath?: string;
    vector?: number[];
}
export interface EmbeddingsData {
    version: string;
    model: string;
    dimensions: number;
    generatedAt: string;
    documents: EmbeddingEntry[];
}
//# sourceMappingURL=types.d.ts.map