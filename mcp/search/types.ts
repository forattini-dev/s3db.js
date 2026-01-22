/**
 * Type definitions for MCP search
 */

export interface IndexedDoc {
  id: string;
  path: string;
  title: string;
  category: string;
  keywords?: string[];
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
  source?: 'fuzzy';
  fullContent?: string;
}

export interface SearchOptions {
  limit?: number;
  category?: string;
  minScore?: number;
}

export interface HybridSearchConfig {
  fuzzyThreshold?: number;
  fuzzyWeight?: number;
  semanticWeight?: number;
  debug?: boolean;
}
