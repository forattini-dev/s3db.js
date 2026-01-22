/**
 * Fuzzy search for documentation.
 * Uses Fuse.js for text matching.
 */

import Fuse from 'fuse.js';

import type { IndexedDoc, SearchResult, SearchOptions, HybridSearchConfig } from './types.js';

const DEFAULT_CONFIG: HybridSearchConfig = {
  fuzzyThreshold: 0.4,
  debug: false,
};

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
  public documents: IndexedDoc[];
  private fuseIndex: Fuse<IndexedDoc>;

  constructor(documents: IndexedDoc[], config: HybridSearchConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config } as Required<HybridSearchConfig>;
    this.documents = documents;

    this.fuseIndex = new Fuse(documents, {
      ...FUSE_OPTIONS,
      threshold: this.config.fuzzyThreshold,
    });

    if (this.config.debug) {
      console.log(`[HybridSearch] Indexed ${documents.length} documents`);
    }
  }

  search(query: string, _queryVector: number[] | null = null, options: SearchOptions = {}): SearchResult[] {
    const { limit = 10, category, minScore = 0 } = options;

    let searchDocs = this.documents;
    if (category) {
      searchDocs = this.documents.filter(d => d.category === category);
    }

    const results = this._fuzzySearch(query, searchDocs);

    return results
      .filter(r => r.score >= minScore)
      .slice(0, limit)
      .map(r => this._formatResult(r, query));
  }

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
      .map(r => this._formatResult(r, query));
  }

  private _fuzzySearch(query: string, documents: IndexedDoc[]): { doc: IndexedDoc; score: number }[] {
    const fuse = documents === this.documents
      ? this.fuseIndex
      : new Fuse(documents, { ...FUSE_OPTIONS, threshold: this.config.fuzzyThreshold });

    const results = fuse.search(query);

    return results.map(r => ({
      doc: r.item,
      score: 1 - (r.score || 0),
    }));
  }

  private _formatResult(result: { doc: IndexedDoc; score: number }, query: string): SearchResult {
    const { doc, score } = result;

    return {
      id: doc.id,
      path: doc.path,
      title: doc.title,
      content: doc.content || '',
      snippet: this._extractSnippet(doc.content || '', query),
      score,
      source: 'fuzzy',
    };
  }

  private _extractSnippet(content: string, query: string, maxLength = 200): string {
    if (!content || !query) {
      return content?.slice(0, maxLength) || '';
    }

    const lowerContent = content.toLowerCase();
    const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);

    let bestPos = 0;
    let bestScore = 0;

    for (const term of queryTerms) {
      const pos = lowerContent.indexOf(term);
      if (pos !== -1) {
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

    const start = Math.max(0, bestPos - 50);
    const end = Math.min(content.length, start + maxLength);
    let snippet = content.slice(start, end);

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

  getStats(): { totalDocuments: number; categories: string[]; config: Required<HybridSearchConfig> } {
    const categories = [...new Set(this.documents.map(d => d.category))];

    return {
      totalDocuments: this.documents.length,
      categories,
      config: this.config,
    };
  }
}

export default HybridSearch;
