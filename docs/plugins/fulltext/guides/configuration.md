# Configuration

> **In this guide:** All configuration options, field weights, search result structure, and API reference.

**Navigation:** [← Back to FullText Plugin](../README.md)

---

## Core Options

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

**Example:**
```javascript
new FullTextPlugin({
  enabled: true,
  fields: ['title', 'description', 'content'],
  minWordLength: 2,
  maxResults: 50
})
```

---

## Resource-Based Configuration

Configure each resource separately with fields and weights:

```javascript
new FullTextPlugin({
  resources: {
    articles: {
      fields: ['title', 'description', 'content'],
      weights: {
        title: 3,        // Title matches 3x more important
        description: 2,
        content: 1
      }
    },
    products: {
      fields: ['name', 'description', 'tags'],
      weights: {
        name: 3.0,
        tags: 2.5,
        description: 1.5
      }
    },
    users: {
      fields: ['name', 'bio']
    }
  }
})
```

---

## Advanced Configuration

```javascript
new FullTextPlugin({
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
    // Standard English stop words
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
})
```

---

## Field Weights Reference

Configure weights to control result relevance:

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

**Guidelines:**
- Higher weight = matches in that field score higher
- Default weight is `1.0`
- Typical range: `0.5` to `5.0`
- Title/name fields usually get highest weights

---

## Search Result Structure

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

**Alternative format:**
```javascript
{
  id: 'article-123',
  title: 'Introduction to JavaScript',
  score: 0.85,              // Relevance score (0-1)
  matchedFields: ['title', 'content'],
  matchedWords: ['javascript'],
  highlighted: {            // If highlight: true
    title: 'Introduction to <mark>JavaScript</mark>'
  }
}
```

---

## Stop Words Configuration

Include domain-specific stop words:

```javascript
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

---

## Namespace Support

Run multiple FullTextPlugin instances with different namespaces:

```javascript
// Catalog search
await db.usePlugin(new FullTextPlugin({
  namespace: 'catalog-search',
  resources: { products: { fields: ['name', 'description'] } }
}));

// Documentation search
await db.usePlugin(new FullTextPlugin({
  namespace: 'docs-search',
  resources: { docs: { fields: ['title', 'content'] } }
}));

// Index storage becomes:
// - plg_catalog-search_fulltext_indexes
// - plg_docs-search_fulltext_indexes
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

#### `search(resourceName, query, options?)`
Alternative search method with same functionality.

```javascript
const results = await plugin.search('articles', 'javascript', {
  limit: 20,
  highlight: true,
  fuzzy: true
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

#### `rebuildAllIndexes()`
Rebuild indexes for all configured resources.

```javascript
await plugin.rebuildAllIndexes();
```

#### `clearIndex(resourceName?)`
Clear all indexes for a resource or all resources.

```javascript
await plugin.clearIndex('articles'); // Clear specific resource
await plugin.clearIndex();           // Clear all indexes
```

#### `clearAllIndexes()`
Clear all indexes across all resources.

```javascript
await plugin.clearAllIndexes();
```

### Index Management

#### `getIndexStats(resourceName?)`
Get statistics about the search indexes.

```javascript
const stats = await plugin.getIndexStats('articles');
// Returns: {
//   totalWords: 15234,
//   totalRecords: 450,
//   avgWordsPerRecord: 33.85,
//   indexSize: '2.3MB',
//   lastIndexed: '2025-10-09T14:30:00Z'
// }
```

#### `getIndexedWords(resourceName, limit?)`
Get list of indexed words for a resource.

```javascript
const words = await plugin.getIndexedWords('articles', 100);
```

---

## Resources Created

The plugin creates one resource for storing indexes:

- **`plg_fulltext_indexes`** (or `plg_{namespace}_fulltext_indexes` with namespace)
  - Stores inverted index (word → record IDs)
  - Attributes: `word`, `resourceName`, `recordIds`, `count`, `lastUpdated`

---

## See Also

- [Usage Patterns](./usage-patterns.md) - Examples and use cases
- [Best Practices](./best-practices.md) - Performance tips, troubleshooting, FAQ
