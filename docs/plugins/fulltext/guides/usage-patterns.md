# Usage Patterns

> **In this guide:** Basic search, advanced patterns, autocomplete, caching, and analytics.

**Navigation:** [← Back to FullText Plugin](../README.md) | [Configuration](./configuration.md)

---

## Basic Search Implementation

```javascript
import { Database } from 's3db.js';
import { FullTextPlugin } from 's3db.js';

const db = new Database({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp"
});

await db.connect();

// Create resource
const products = await db.createResource({
  name: 'products',
  attributes: {
    name: 'string|required',
    description: 'string',
    tags: 'array'
  }
});

// Configure full-text search
await db.usePlugin(new FullTextPlugin({
  enabled: true,
  fields: ['name', 'description', 'tags'],
  minWordLength: 2,
  maxResults: 50
}));

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
const gamingProducts = await db.plugins.fulltext.searchRecords('products', 'gaming');

console.log('\n=== Gaming Products ===');
gamingProducts.forEach(product => {
  console.log(`${product.name} (Score: ${product._searchScore.toFixed(2)})`);
  console.log(`  Matched fields: ${product._matchedFields.join(', ')}`);
  console.log(`  Description: ${product.description}`);
});

// Multi-word search
const laptopGaming = await db.plugins.fulltext.searchRecords('products', 'laptop gaming');
console.log(`Found ${laptopGaming.length} products matching "laptop gaming"`);
```

---

## Search with Highlighting

```javascript
const results = await plugin.search('articles', 'machine learning', {
  highlight: true,
  highlightTag: 'mark'
});

console.log('\nWith highlighting:');
console.log(results[0].highlighted.title);
// Output: Introduction to <mark>Machine</mark> <mark>Learning</mark>
```

---

## Fuzzy Search (Typo Tolerance)

```javascript
const fuzzyResults = await plugin.search('articles', 'machne lerning', {
  fuzzy: true,
  maxDistance: 2  // Allow 2 character differences
});

console.log(`Fuzzy search found ${fuzzyResults.length} results`);
// Still finds "machine learning" despite typos!
```

---

## Multi-Resource Search

Search across multiple resources and combine results:

```javascript
class AdvancedSearch {
  constructor(fulltextPlugin) {
    this.plugin = fulltextPlugin;
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
}

// Usage
const search = new AdvancedSearch(db.plugins.fulltext);
const allContent = await search.searchMultipleResources(['articles', 'products'], 'technology');
```

---

## Search with Filters

Combine full-text search with additional filters:

```javascript
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
}

// Usage
const search = new AdvancedSearch(db.plugins.fulltext);
const techArticles = await search.searchWithFilters('articles', 'javascript programming', {
  category: 'technology',
  minScore: 0.5
});
```

---

## Autocomplete Suggestions

Get word suggestions based on partial input:

```javascript
class AdvancedSearch {
  constructor(fulltextPlugin) {
    this.plugin = fulltextPlugin;
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
}

// Usage
const search = new AdvancedSearch(db.plugins.fulltext);
const suggestions = await search.suggestWords('articles', 'java');
console.log('Suggestions for "java":', suggestions);
// ['javascript', 'java', 'javadoc', ...]
```

---

## Real-time Search Interface

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
const realTimeSearch = new RealTimeSearch(db.plugins.fulltext);

// Search with autocomplete
const searchResult = await realTimeSearch.searchWithAutocomplete('articles', 'machine lear');
console.log('Results:', searchResult.results);
console.log('Suggestions:', searchResult.suggestions);

// Get popular queries
const popular = realTimeSearch.getPopularQueries();
console.log('Popular searches:', popular);
```

---

## Search Result Caching

Combine with CachePlugin for better performance:

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
const cachedSearch = new CachedSearch(db.plugins.fulltext, db.plugins.cache);

// Search with caching
const results = await cachedSearch.searchWithCache('articles', 'machine learning');
console.log('From cache:', results.fromCache);

// Invalidate cache when data changes
articles.on('inserted', () => cachedSearch.invalidateSearchCache('articles'));
articles.on('updated', () => cachedSearch.invalidateSearchCache('articles'));
articles.on('deleted', () => cachedSearch.invalidateSearchCache('articles'));
```

---

## Search Analytics and Insights

```javascript
class SearchAnalytics {
  constructor(fullTextPlugin) {
    this.plugin = fullTextPlugin;
    this.queries = [];
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

    return {
      totalQueries: recentQueries.length,
      uniqueQueries: new Set(recentQueries.map(q => q.query)).size,
      noResultQueries: recentQueries.filter(q => !q.hasResults).length,
      avgResultsPerQuery: recentQueries.reduce((sum, q) => sum + q.resultCount, 0) / recentQueries.length,
      topQueries: this.getTopQueries(recentQueries),
      failedQueries: recentQueries.filter(q => !q.hasResults).map(q => q.query),
      hourlyDistribution: this.getHourlyDistribution(recentQueries)
    };
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
const analytics = new SearchAnalytics(db.plugins.fulltext);

// Track searches
db.plugins.fulltext.on('searched', (data) => {
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

## Progressive Search

Start with exact matches, fall back to fuzzy:

```javascript
class ProgressiveSearch {
  constructor(plugin) {
    this.plugin = plugin;
  }

  async search(resourceName, query) {
    // Start with exact matches
    let results = await this.plugin.searchRecords(resourceName, query, {
      fuzzySearch: false,
      minScore: 0.8
    });

    // If few results, try fuzzy search
    if (results.length < 5) {
      const fuzzyResults = await this.plugin.searchRecords(resourceName, query, {
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

---

## AND/OR Logic

The plugin uses OR logic by default. For AND logic:

```javascript
const results = await plugin.search('articles', 'javascript async');

// Filter for AND logic
const andResults = results.filter(r =>
  r.matchedWords.includes('javascript') &&
  r.matchedWords.includes('async')
);
```

---

## Phrase Search

For exact phrase matching:

```javascript
const results = await plugin.search('articles', 'machine learning');

// Filter for exact phrase
const phraseResults = results.filter(r =>
  r.content.includes('machine learning')
);
```

---

## Boosting Specific Records

Adjust scores post-search:

```javascript
const results = await plugin.search('articles', query);

const boosted = results.map(r => ({
  ...r,
  score: r.featured ? r.score * 1.5 : r.score
})).sort((a, b) => b.score - a.score);
```

---

## See Also

- [Configuration](./configuration.md) - All options and API reference
- [Best Practices](./best-practices.md) - Performance tips, troubleshooting, FAQ
