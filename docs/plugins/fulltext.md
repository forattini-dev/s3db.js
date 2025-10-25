# 🔍 FullText Plugin

## ⚡ TLDR

**Full-text** search engine with automatic indexing, relevance scoring, and highlighting.

**2 lines to get started:**
```javascript
await db.usePlugin(new FullTextPlugin({ fields: ['title', 'description', 'content'] }));
const results = await db.plugins.fulltext.searchRecords('articles', 'machine learning');
```

**Key features:**
- ✅ Automatic indexing on insert/update
- ✅ Relevance scoring with field weights
- ✅ Highlighting of matched terms
- ✅ Fuzzy search + stemming
- ✅ Multi-field + multi-resource search

**When to use:**
- 🔍 Searching articles/documents
- 📦 Product catalogs
- 💬 Forums and comments
- 📚 Knowledge bases

---

## ⚡ Quick Start

Add full-text search to your app in under 2 minutes:

```javascript
import { Database, FullTextPlugin } from 's3db.js';

// Step 1: Create database
const db = new Database({ connectionString: 's3://key:secret@bucket' });
await db.connect();

// Step 2: Create a resource (example: articles)
const articles = await db.createResource({
  name: 'articles',
  attributes: {
    title: 'string|required',
    description: 'string',
    content: 'string|required',
    author: 'string',
    tags: 'array'
  }
});

// Step 3: Configure full-text search
const fulltextPlugin = new FullTextPlugin({
  resources: {
    articles: {
      fields: ['title', 'description', 'content'],  // Fields to index
      weights: {
        title: 3,        // Title matches are 3x more important
        description: 2,  // Description 2x
        content: 1       // Content has base weight
      }
    }
  }
});

await db.usePlugin(fulltextPlugin);

// Step 4: Add some articles (automatically indexed)
await articles.insert({
  title: 'Introduction to Machine Learning',
  description: 'A beginner-friendly guide to ML concepts',
  content: 'Machine learning is a subset of artificial intelligence...',
  author: 'Alice',
  tags: ['AI', 'ML', 'Tutorial']
});

await articles.insert({
  title: 'Deep Learning Fundamentals',
  description: 'Understanding neural networks and deep learning',
  content: 'Deep learning uses neural networks with multiple layers...',
  author: 'Bob',
  tags: ['AI', 'Deep Learning', 'Neural Networks']
});

await articles.insert({
  title: 'Data Science Best Practices',
  description: 'Essential practices for data scientists',
  content: 'Data science combines statistics, programming, and domain knowledge...',
  author: 'Carol',
  tags: ['Data Science', 'Best Practices']
});

// Step 5: Search for articles
const results = await fulltextPlugin.search('articles', 'machine learning');

console.log(`Found ${results.length} results:`);
results.forEach((result, index) => {
  console.log(`\n${index + 1}. ${result.title} (score: ${result.score.toFixed(2)})`);
  console.log(`   ${result.description}`);
  console.log(`   Matched in: ${result.matchedFields.join(', ')}`);
});

// Output:
// Found 2 results:
//
// 1. Introduction to Machine Learning (score: 8.45)
//    A beginner-friendly guide to ML concepts
//    Matched in: title, description, content
//
// 2. Deep Learning Fundamentals (score: 2.10)
//    Understanding neural networks and deep learning
//    Matched in: content

// Step 6: Search with highlighting
const highlightedResults = await fulltextPlugin.search('articles', 'machine learning', {
  highlight: true,
  highlightTag: 'mark'
});

console.log('\nWith highlighting:');
console.log(highlightedResults[0].highlighted.title);
// Output: Introduction to <mark>Machine</mark> <mark>Learning</mark>

// Step 7: Fuzzy search (handles typos)
const fuzzyResults = await fulltextPlugin.search('articles', 'machne lerning', {
  fuzzy: true,
  maxDistance: 2  // Allow 2 character differences
});

console.log(`\nFuzzy search found ${fuzzyResults.length} results`);
// Still finds "machine learning" despite typos!
```

**What just happened:**
1. ✅ Full-text index created for 3 fields (title, description, content)
2. ✅ Field weights configured (title 3x more important)
3. ✅ Articles automatically indexed on insert
4. ✅ Search with relevance scoring and highlighting

**Next steps:**
- Add multi-resource search (see [Usage Examples](#usage-examples))
- Configure stemming and stop words (see [Configuration Options](#configuration-options))
- Enable autocomplete suggestions (see [Advanced Patterns](#advanced-patterns))

---

## 📋 Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Installation & Setup](#installation--setup)
- [Configuration Options](#configuration-options)
- [Usage Examples](#usage-examples)
- [API Reference](#api-reference)
- [Advanced Patterns](#advanced-patterns)
- [Best Practices](#best-practices)

---

## Overview

The FullText Plugin provides a powerful full-text search engine with automatic indexing, relevance scoring, and advanced search capabilities. It automatically indexes specified fields and provides fast, intelligent search across your s3db resources.

### How It Works

1. **Automatic Indexing**: Indexes specified fields when records are created or updated
2. **Intelligent Scoring**: Ranks results by relevance using configurable field weights
3. **Advanced Processing**: Supports stemming, fuzzy search, and custom stop words
4. **Real-time Search**: Fast search with highlighting and filtering capabilities
5. **Multi-resource Support**: Search across multiple resources simultaneously

> 🔍 **Intelligent Search**: Transform your data into a searchable knowledge base with advanced text processing and relevance scoring.

---

## Key Features

### 🎯 Core Features
- **Automatic Indexing**: Indexes specified fields automatically on data changes
- **Relevance Scoring**: Intelligent scoring based on field weights and match quality
- **Highlighting**: Automatic highlighting of matched terms in results
- **Multi-field Search**: Search across multiple fields simultaneously
- **Fuzzy Matching**: Tolerates typos and variations in search terms

### 🔧 Technical Features
- **Stemming Support**: Handles word variations (run/running/ran)
- **Stop Words**: Configurable list of words to ignore during indexing
- **Custom Weights**: Field-specific scoring weights for relevance tuning
- **Batch Processing**: Efficient bulk indexing operations
- **Search Analytics**: Insights into search patterns and index statistics

---

## Installation & Setup

### Basic Setup

```javascript
import { S3db, FullTextPlugin } from 's3db.js';

const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [new FullTextPlugin({
    enabled: true,
    fields: ['title', 'description', 'content']
  })]
});

await s3db.connect();

const articles = s3db.resources.articles;

// Insert data (automatically indexed)
await articles.insert({
  title: 'Introduction to Machine Learning',
  description: 'A comprehensive guide to ML basics',
  content: 'Machine learning is a subset of artificial intelligence...'
});

// Search across indexed fields
const results = await s3db.plugins.fulltext.searchRecords('articles', 'machine learning');
console.log('Search results:', results);
```

---

## Configuration Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable full-text search |
| `fields` | array | `[]` | Fields to index for search |
| `minWordLength` | number | `3` | Minimum word length for indexing |
| `maxResults` | number | `100` | Maximum search results to return |
| `language` | string | `'en-US'` | Language for text processing |
| `stopWords` | array | `['the', 'a', 'an', ...]` | Words to exclude from indexing |
| `stemming` | boolean | `false` | Enable word stemming |
| `caseSensitive` | boolean | `false` | Case-sensitive search |
| `fuzzySearch` | boolean | `false` | Enable fuzzy matching |
| `indexName` | string | `'fulltext_indexes'` | Name of index resource |
| `fieldWeights` | object | `{}` | Custom scoring weights per field |
| `highlightTags` | object | `{start: '<mark>', end: '</mark>'}` | HTML tags for highlighting |

### Search Result Structure

```javascript
{
  id: 'article-123',
  title: 'Introduction to Machine Learning',
  description: 'A comprehensive guide to ML basics',
  content: 'Machine learning is a subset...',
  _searchScore: 0.85,              // Relevance score (0-1)
  _matchedFields: ['title', 'content'],  // Fields with matches
  _matchedWords: ['machine', 'learning'], // Matched search terms
  _highlights: {                   // Highlighted snippets
    title: 'Introduction to <mark>Machine Learning</mark>',
    content: '<mark>Machine learning</mark> is a subset...'
  }
}
```

---

## Usage Examples

### Basic Search Implementation

```javascript
import { S3db, FullTextPlugin } from 's3db.js';

const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [new FullTextPlugin({
    enabled: true,
    fields: ['name', 'description', 'tags'],
    minWordLength: 2,
    maxResults: 50
  })]
});

await s3db.connect();

const products = s3db.resources.products;

// Add products with searchable content
await products.insertMany([
  {
    name: 'Gaming Laptop Pro',
    description: 'High-performance laptop for gaming and productivity',
    tags: ['gaming', 'laptop', 'computer', 'electronics']
  },
  {
    name: 'Wireless Gaming Mouse',
    description: 'Precision wireless mouse designed for gamers',
    tags: ['gaming', 'mouse', 'wireless', 'electronics']
  },
  {
    name: 'Mechanical Keyboard',
    description: 'Professional mechanical keyboard with RGB lighting',
    tags: ['keyboard', 'mechanical', 'typing', 'electronics']
  }
]);

// Search for gaming products
const gamingProducts = await s3db.plugins.fulltext.searchRecords('products', 'gaming');

console.log('\n=== Gaming Products ===');
gamingProducts.forEach(product => {
  console.log(`${product.name} (Score: ${product._searchScore.toFixed(2)})`);
  console.log(`  Matched fields: ${product._matchedFields.join(', ')}`);
  console.log(`  Description: ${product.description}`);
});

// Search for wireless devices
const wirelessProducts = await s3db.plugins.fulltext.searchRecords('products', 'wireless');

// Multi-word search
const laptopGaming = await s3db.plugins.fulltext.searchRecords('products', 'laptop gaming');
console.log(`Found ${laptopGaming.length} products matching "laptop gaming"`);
```

### Advanced Configuration

```javascript
const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [new FullTextPlugin({
    enabled: true,

    // Comprehensive field indexing
    fields: ['title', 'description', 'content', 'tags', 'category', 'author'],

    // Advanced text processing
    minWordLength: 2,
    maxResults: 200,
    language: 'en-US',
    stemming: true,          // Enable word stemming (run/running/ran)
    caseSensitive: false,
    fuzzySearch: true,       // Enable typo tolerance

    // Custom stop words (words to ignore)
    stopWords: [
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those'
    ],

    // Advanced search options
    highlightTags: {
      start: '<mark class="highlight">',
      end: '</mark>'
    },

    // Custom scoring weights per field
    fieldWeights: {
      title: 3.0,        // Title matches score higher
      description: 2.0,   // Description is important
      content: 1.0,       // Content has normal weight
      tags: 2.5,          // Tags are highly relevant
      category: 1.5,      // Category is moderately important
      author: 1.0         // Author has normal weight
    },

    // Indexing behavior
    indexName: 'search_indexes',
    autoReindex: true,      // Automatically reindex on data changes
    batchSize: 100,         // Index batch size
    maxIndexSize: 10000     // Maximum index entries
  })]
});
```

### Advanced Search Class

```javascript
// Advanced search class with custom methods
class AdvancedSearch {
  constructor(fulltextPlugin) {
    this.plugin = fulltextPlugin;
  }

  async searchWithFilters(resourceName, query, filters = {}) {
    let results = await this.plugin.searchRecords(resourceName, query);

    // Apply additional filters
    if (filters.category) {
      results = results.filter(item => item.category === filters.category);
    }

    if (filters.minScore) {
      results = results.filter(item => item._searchScore >= filters.minScore);
    }

    if (filters.dateRange) {
      const { start, end } = filters.dateRange;
      results = results.filter(item => {
        const itemDate = new Date(item.createdAt);
        return itemDate >= start && itemDate <= end;
      });
    }

    return results;
  }

  async searchMultipleResources(resourceNames, query) {
    const allResults = [];

    for (const resourceName of resourceNames) {
      const results = await this.plugin.searchRecords(resourceName, query);
      allResults.push(...results.map(item => ({
        ...item,
        _resourceType: resourceName
      })));
    }

    // Sort by relevance across all resources
    return allResults.sort((a, b) => b._searchScore - a._searchScore);
  }

  async suggestWords(resourceName, partial) {
    // Get all indexed words that start with partial
    const allIndexes = await this.plugin.indexResource.list();

    const suggestions = allIndexes
      .filter(index =>
        index.resourceName === resourceName &&
        index.word.toLowerCase().startsWith(partial.toLowerCase())
      )
      .sort((a, b) => b.count - a.count) // Sort by frequency
      .slice(0, 10)
      .map(index => index.word);

    return [...new Set(suggestions)]; // Remove duplicates
  }

  async getSearchAnalytics(resourceName) {
    const indexes = await this.plugin.indexResource.list();
    const resourceIndexes = indexes.filter(i => i.resourceName === resourceName);

    const analytics = {
      totalWords: resourceIndexes.length,
      totalOccurrences: resourceIndexes.reduce((sum, i) => sum + i.count, 0),
      avgWordsPerDocument: 0,
      topWords: resourceIndexes
        .sort((a, b) => b.count - a.count)
        .slice(0, 20)
        .map(i => ({ word: i.word, count: i.count })),
      wordDistribution: {},
      lastIndexed: Math.max(...resourceIndexes.map(i => new Date(i.lastUpdated)))
    };

    // Calculate word distribution by frequency ranges
    resourceIndexes.forEach(index => {
      const range = index.count < 5 ? 'rare' :
                   index.count < 20 ? 'common' : 'frequent';
      analytics.wordDistribution[range] = (analytics.wordDistribution[range] || 0) + 1;
    });

    return analytics;
  }
}

// Usage
const search = new AdvancedSearch(s3db.plugins.fulltext);

// Complex search with filters
const techArticles = await search.searchWithFilters('articles', 'javascript programming', {
  category: 'technology',
  minScore: 0.5
});

// Multi-resource search
const allContent = await search.searchMultipleResources(['articles', 'products'], 'technology');

// Auto-complete suggestions
const suggestions = await search.suggestWords('articles', 'java');
console.log('Suggestions for "java":', suggestions);

// Search analytics
const analytics = await search.getSearchAnalytics('articles');
console.log('Search analytics:', analytics);
```

---

## API Reference

### Plugin Constructor

```javascript
new FullTextPlugin({
  enabled?: boolean,
  fields: string[],
  minWordLength?: number,
  maxResults?: number,
  language?: string,
  stopWords?: string[],
  stemming?: boolean,
  caseSensitive?: boolean,
  fuzzySearch?: boolean,
  indexName?: string,
  fieldWeights?: object,
  highlightTags?: object,
  autoReindex?: boolean,
  batchSize?: number,
  maxIndexSize?: number
})
```

### Search Methods

#### `searchRecords(resourceName, query, options?)`
Search for records matching the query.

```javascript
const results = await plugin.searchRecords('articles', 'machine learning', {
  limit: 20,
  offset: 0,
  minScore: 0.1,
  fields: ['title', 'content'] // Limit search to specific fields
});
```

#### `indexRecord(resourceName, recordId, data)`
Manually index a specific record.

```javascript
await plugin.indexRecord('articles', 'article-123', {
  title: 'New Article',
  content: 'Article content...'
});
```

#### `removeFromIndex(resourceName, recordId)`
Remove a record from the search index.

```javascript
await plugin.removeFromIndex('articles', 'article-123');
```

#### `reindexResource(resourceName)`
Rebuild the entire index for a resource.

```javascript
await plugin.reindexResource('articles');
```

#### `clearIndex(resourceName?)`
Clear all indexes for a resource or all resources.

```javascript
await plugin.clearIndex('articles'); // Clear specific resource
await plugin.clearIndex();           // Clear all indexes
```

### Index Management

#### `getIndexStats(resourceName?)`
Get statistics about the search indexes.

```javascript
const stats = await plugin.getIndexStats('articles');
// Returns: { totalWords: 1500, totalRecords: 100, avgWordsPerRecord: 15 }
```

#### `getIndexedWords(resourceName, limit?)`
Get list of indexed words for a resource.

```javascript
const words = await plugin.getIndexedWords('articles', 100);
```

---

## Advanced Patterns

### Real-time Search Interface

```javascript
class RealTimeSearch {
  constructor(fullTextPlugin) {
    this.plugin = fullTextPlugin;
    this.searchHistory = [];
    this.popularQueries = new Map();
  }

  async search(resourceName, query, options = {}) {
    const startTime = Date.now();

    // Record search query
    this.recordQuery(query);

    // Perform search
    const results = await this.plugin.searchRecords(resourceName, query, options);

    const searchTime = Date.now() - startTime;

    // Add search metadata
    const searchResult = {
      query,
      resourceName,
      results: results.length,
      searchTime,
      timestamp: new Date().toISOString(),
      data: results
    };

    this.searchHistory.push(searchResult);

    // Emit search event
    this.plugin.emit('searched', searchResult);

    return searchResult;
  }

  recordQuery(query) {
    const count = this.popularQueries.get(query) || 0;
    this.popularQueries.set(query, count + 1);
  }

  getPopularQueries(limit = 10) {
    return Array.from(this.popularQueries.entries())
      .sort(([,a], [,b]) => b - a)
      .slice(0, limit)
      .map(([query, count]) => ({ query, count }));
  }

  async searchWithAutocomplete(resourceName, query, maxSuggestions = 5) {
    const results = await this.search(resourceName, query);

    // Get word suggestions based on partial matches
    const words = query.split(' ');
    const lastWord = words[words.length - 1];

    const suggestions = await this.getSuggestions(resourceName, lastWord, maxSuggestions);

    return {
      ...results,
      suggestions: suggestions.map(word => {
        const newWords = [...words.slice(0, -1), word];
        return newWords.join(' ');
      })
    };
  }

  async getSuggestions(resourceName, partial, limit) {
    const indexedWords = await this.plugin.getIndexedWords(resourceName, 1000);

    return indexedWords
      .filter(word => word.toLowerCase().startsWith(partial.toLowerCase()))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, limit)
      .map(item => item.word);
  }
}

// Usage
const realTimeSearch = new RealTimeSearch(s3db.plugins.fulltext);

// Search with autocomplete
const searchResult = await realTimeSearch.searchWithAutocomplete('articles', 'machine lear');
console.log('Results:', searchResult.results);
console.log('Suggestions:', searchResult.suggestions);

// Get popular queries
const popular = realTimeSearch.getPopularQueries();
console.log('Popular searches:', popular);
```

### Search Result Caching

```javascript
class CachedSearch {
  constructor(fullTextPlugin, cachePlugin) {
    this.search = fullTextPlugin;
    this.cache = cachePlugin;
    this.cachePrefix = 'search:';
    this.cacheTTL = 300000; // 5 minutes
  }

  async searchWithCache(resourceName, query, options = {}) {
    const cacheKey = this.generateCacheKey(resourceName, query, options);

    // Try cache first
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      return { ...cached, fromCache: true };
    }

    // Perform search
    const results = await this.search.searchRecords(resourceName, query, options);

    // Cache results
    await this.cache.set(cacheKey, { results, query, resourceName }, this.cacheTTL);

    return { results, query, resourceName, fromCache: false };
  }

  generateCacheKey(resourceName, query, options) {
    const optionsKey = JSON.stringify(options);
    return `${this.cachePrefix}${resourceName}:${query}:${optionsKey}`;
  }

  async invalidateSearchCache(resourceName) {
    // Clear all cached searches for a resource
    const pattern = `${this.cachePrefix}${resourceName}:*`;
    await this.cache.clearPattern(pattern);
  }
}

// Usage with cache plugin
const cachedSearch = new CachedSearch(s3db.plugins.fulltext, s3db.plugins.cache);

// Search with caching
const results = await cachedSearch.searchWithCache('articles', 'machine learning');
console.log('From cache:', results.fromCache);

// Invalidate cache when data changes
articles.on('inserted', () => cachedSearch.invalidateSearchCache('articles'));
articles.on('updated', () => cachedSearch.invalidateSearchCache('articles'));
articles.on('deleted', () => cachedSearch.invalidateSearchCache('articles'));
```

### Search Analytics and Insights

```javascript
class SearchAnalytics {
  constructor(fullTextPlugin) {
    this.plugin = fullTextPlugin;
    this.queries = [];
    this.results = [];
  }

  async trackSearch(resourceName, query, results) {
    const searchEvent = {
      timestamp: new Date().toISOString(),
      resourceName,
      query: query.toLowerCase(),
      resultCount: results.length,
      hasResults: results.length > 0,
      avgScore: results.length > 0 ?
        results.reduce((sum, r) => sum + r._searchScore, 0) / results.length : 0
    };

    this.queries.push(searchEvent);

    // Keep only recent data (last 1000 queries)
    if (this.queries.length > 1000) {
      this.queries = this.queries.slice(-1000);
    }
  }

  getSearchTrends(timeRange = 24) { // hours
    const cutoff = new Date(Date.now() - timeRange * 60 * 60 * 1000);
    const recentQueries = this.queries.filter(q => new Date(q.timestamp) > cutoff);

    const trends = {
      totalQueries: recentQueries.length,
      uniqueQueries: new Set(recentQueries.map(q => q.query)).size,
      noResultQueries: recentQueries.filter(q => !q.hasResults).length,
      avgResultsPerQuery: recentQueries.reduce((sum, q) => sum + q.resultCount, 0) / recentQueries.length,
      topQueries: this.getTopQueries(recentQueries),
      noResultQueries: recentQueries.filter(q => !q.hasResults).map(q => q.query),
      hourlyDistribution: this.getHourlyDistribution(recentQueries)
    };

    return trends;
  }

  getTopQueries(queries, limit = 10) {
    const queryCount = new Map();

    queries.forEach(q => {
      const count = queryCount.get(q.query) || 0;
      queryCount.set(q.query, count + 1);
    });

    return Array.from(queryCount.entries())
      .sort(([,a], [,b]) => b - a)
      .slice(0, limit)
      .map(([query, count]) => ({ query, count }));
  }

  getHourlyDistribution(queries) {
    const hours = Array(24).fill(0);

    queries.forEach(q => {
      const hour = new Date(q.timestamp).getHours();
      hours[hour]++;
    });

    return hours;
  }

  async generateInsights() {
    const trends = this.getSearchTrends();
    const indexStats = await this.plugin.getIndexStats();

    const insights = {
      searchVolume: this.categorizeVolume(trends.totalQueries),
      searchEffectiveness: trends.noResultQueries / trends.totalQueries,
      popularTopics: this.extractTopics(trends.topQueries),
      recommendations: []
    };

    // Generate recommendations
    if (insights.searchEffectiveness > 0.3) {
      insights.recommendations.push('High no-result rate detected. Consider expanding indexed content or improving search synonyms.');
    }

    if (trends.uniqueQueries / trends.totalQueries < 0.3) {
      insights.recommendations.push('Users are repeating searches. Consider improving result relevance or adding search suggestions.');
    }

    return insights;
  }

  categorizeVolume(queryCount) {
    if (queryCount < 10) return 'low';
    if (queryCount < 100) return 'medium';
    return 'high';
  }

  extractTopics(topQueries) {
    const words = topQueries
      .flatMap(q => q.query.split(' '))
      .filter(word => word.length > 3);

    const wordCount = new Map();
    words.forEach(word => {
      const count = wordCount.get(word) || 0;
      wordCount.set(word, count + 1);
    });

    return Array.from(wordCount.entries())
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([word, count]) => ({ topic: word, frequency: count }));
  }
}

// Usage
const analytics = new SearchAnalytics(s3db.plugins.fulltext);

// Track searches
s3db.plugins.fulltext.on('searched', (data) => {
  analytics.trackSearch(data.resourceName, data.query, data.results);
});

// Get insights
const insights = await analytics.generateInsights();
console.log('Search insights:', insights);

// Get trends
const trends = analytics.getSearchTrends(24); // Last 24 hours
console.log('Search trends:', trends);
```

---

## Best Practices

### 1. Choose the Right Fields

```javascript
// Good: Index meaningful text fields
{
  fields: ['title', 'description', 'content', 'tags', 'category']
}

// Avoid: Indexing non-searchable fields
// Don't index: dates, numbers, IDs, binary data
```

### 2. Configure Field Weights Appropriately

```javascript
{
  fieldWeights: {
    title: 3.0,      // Highest weight for titles
    tags: 2.5,       // Tags are very relevant
    description: 2.0, // Descriptions are important
    content: 1.0,    // Content is baseline
    category: 1.5,   // Categories are moderately relevant
    author: 0.5      // Author names less relevant
  }
}
```

### 3. Optimize Stop Words

```javascript
// Include domain-specific stop words
{
  stopWords: [
    // Standard English stop words
    'the', 'a', 'an', 'and', 'or', 'but',
    // Domain-specific stop words
    'product', 'item', 'service', 'company',
    // Your application-specific words
    'myapp', 'platform', 'system'
  ]
}
```

### 4. Implement Progressive Search

```javascript
class ProgressiveSearch {
  async search(resourceName, query) {
    // Start with exact matches
    let results = await plugin.searchRecords(resourceName, query, {
      fuzzySearch: false,
      minScore: 0.8
    });

    // If few results, try fuzzy search
    if (results.length < 5) {
      const fuzzyResults = await plugin.searchRecords(resourceName, query, {
        fuzzySearch: true,
        minScore: 0.5
      });

      // Merge results, avoiding duplicates
      const existingIds = new Set(results.map(r => r.id));
      const newResults = fuzzyResults.filter(r => !existingIds.has(r.id));
      results = [...results, ...newResults];
    }

    return results;
  }
}
```

### 5. Handle Large Datasets

```javascript
// For large datasets, implement pagination
{
  maxResults: 50,      // Limit initial results
  batchSize: 100,      // Efficient indexing batches
  maxIndexSize: 50000  // Prevent index bloat
}

// Implement search pagination
const searchWithPagination = async (resourceName, query, page = 1, pageSize = 20) => {
  const offset = (page - 1) * pageSize;

  return await plugin.searchRecords(resourceName, query, {
    limit: pageSize,
    offset: offset
  });
};
```

### 6. Monitor Search Performance

```javascript
// Track search performance
const monitorSearch = async (resourceName, query) => {
  const startTime = Date.now();

  const results = await plugin.searchRecords(resourceName, query);

  const searchTime = Date.now() - startTime;

  // Log slow searches
  if (searchTime > 1000) {
    console.warn(`Slow search detected: "${query}" took ${searchTime}ms`);
  }

  return { results, searchTime };
};
```

### 7. Regular Index Maintenance

```javascript
// Schedule regular index cleanup
const maintainIndexes = async () => {
  // Get index statistics
  const stats = await plugin.getIndexStats();

  // Clean up if index is too large
  if (stats.totalWords > 100000) {
    console.log('Index size limit reached, performing cleanup...');

    // Remove low-frequency words
    await plugin.cleanupIndex({ minWordFrequency: 2 });
  }

  // Rebuild indexes periodically
  const lastRebuild = await getLastRebuildTime();
  const daysSinceRebuild = (Date.now() - lastRebuild) / (1000 * 60 * 60 * 24);

  if (daysSinceRebuild > 7) {
    console.log('Rebuilding search indexes...');
    await plugin.reindexAllResources();
    await setLastRebuildTime(Date.now());
  }
};

// Run maintenance weekly
setInterval(maintainIndexes, 7 * 24 * 60 * 60 * 1000);
```

---

## Troubleshooting

### Issue: Search results are not relevant
**Solution**: Adjust field weights, refine stop words list, or enable stemming for better matching.

### Issue: Search is too slow
**Solution**: Reduce indexed fields, implement result pagination, or add search result caching.

### Issue: No results for valid queries
**Solution**: Check field configuration, verify data is being indexed, or reduce minimum score threshold.

### Issue: Index growing too large
**Solution**: Increase minimum word length, add more stop words, or implement periodic index cleanup.

### Issue: Fuzzy search returning too many irrelevant results
**Solution**: Increase minimum score threshold or reduce fuzzy search sensitivity.

---

## See Also

- [Plugin Development Guide](./plugin-development.md)
- [Cache Plugin](./cache.md) - Cache search results for better performance
- [Metrics Plugin](./metrics.md) - Monitor search performance and usage
- [Audit Plugin](./audit.md) - Track search operations and access patterns

## ❓ FAQ

### Básico

**P: O que o FullTextPlugin faz?**
R: Adiciona busca full-text em campos de texto usando índices invertidos armazenados no S3, similar a Elasticsearch mas usando S3DB.

**Q: How does indexing work?**
R: Tokeniza o texto, cria índices invertidos (palavra → IDs dos registros) e armazena no recurso `plg_fulltext_indexes`.

**P: Suporta acentuação e caracteres especiais?**
R: Sim, preserva caracteres acentuados (UTF-8 completo) e normaliza automaticamente durante a tokenização.

### Configuração

**P: Como configurar quais campos indexar?**
R: Use a opção `fields`:
```javascript
new FullTextPlugin({
  fields: ['title', 'description', 'tags']
})
```

**P: Como configurar tamanho mínimo de palavra?**
R: Use `minWordLength`:
```javascript
new FullTextPlugin({
  minWordLength: 2  // Indexa palavras com 2+ caracteres (padrão: 3)
})
```

**P: Como configurar número máximo de resultados?**
R: Use `maxResults`:
```javascript
new FullTextPlugin({
  maxResults: 50  // Padrão: 100
})
```

### Operações

**P: Como fazer uma busca?**
R: Use os métodos de busca:
```javascript
// Busca e retorna apenas IDs com score
const results = await fulltextPlugin.search('articles', 'javascript async', {
  limit: 20,
  exactMatch: false
});

// Busca e retorna registros completos com _searchScore
const articles = await fulltextPlugin.searchRecords('articles', 'javascript async', {
  limit: 20,
  fields: ['title', 'content']  // Busca apenas nestes campos
});
```

**P: Qual a diferença entre exact match e partial match?**
R:
- `exactMatch: true` busca palavras exatas
- `exactMatch: false` (padrão) busca palavras que começam com o termo (ex: "java" encontra "javascript")

**P: Como rebuild os índices?**
R: Use `rebuildIndex`:
```javascript
// Rebuild de um recurso
await fulltextPlugin.rebuildIndex('articles');

// Rebuild de todos os recursos
await fulltextPlugin.rebuildAllIndexes();
```

### Manutenção

**P: Como obter estatísticas dos índices?**
R: Use `getIndexStats`:
```javascript
const stats = await fulltextPlugin.getIndexStats();
// Retorna: totalIndexes, resources, totalWords, avgWordsPerResource, etc.
```

**P: Como limpar índices?**
R: Use `clearIndex` ou `clearAllIndexes`:
```javascript
await fulltextPlugin.clearIndex('articles');
await fulltextPlugin.clearAllIndexes();
```

**P: Os índices são atualizados automaticamente?**
R: Sim, o plugin monitora insert/update/delete e atualiza os índices em tempo real automaticamente.

### Performance

**P: Qual o impacto de performance da indexação?**
R: Mínimo em operações de leitura. Inserts/updates são ~10-30% mais lentos devido à tokenização e atualização de índices.

**P: Como otimizar a busca?**
R:
1. Use `fields` específicos ao invés de buscar todos os campos
2. Use `limit` baixo para retornar apenas resultados relevantes
3. Use `exactMatch: true` quando possível
4. Considere pagination com `offset`

**P: Posso usar em produção?**
R: Sim, mas para volumes muito grandes (milhões de registros), considere uma solução dedicada como Elasticsearch ou Typesense.

### Troubleshooting

**P: Busca não retorna resultados esperados?**
R: Verifique:
1. Palavras têm tamanho >= `minWordLength`
2. Campos estão incluídos em `fields`
3. Índices foram criados (use `getIndexStats`)
4. Use `exactMatch: false` para busca parcial

**P: Como debugar índices?**
R: Consulte diretamente o recurso de índices:
```javascript
const indexes = await database.resources.plg_fulltext_indexes.list();
console.log(indexes);
```

---
