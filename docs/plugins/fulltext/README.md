# FullText Plugin

> **Automatic full-text indexing with relevance scoring, fuzzy matching, and highlights.**

---

## TLDR

**Full-text** search engine with automatic indexing, relevance scoring, and highlighting.

**2 lines to get started:**
```javascript
await db.usePlugin(new FullTextPlugin({ fields: ['title', 'description', 'content'] }));
const results = await db.plugins.fulltext.searchRecords('articles', 'machine learning');
```

**Key features:**
- Automatic indexing on insert/update
- Relevance scoring with field weights
- Highlighting of matched terms
- Fuzzy search + stemming
- Multi-field + multi-resource search

**When to use:**
- Searching articles/documents
- Product catalogs
- Forums and comments
- Knowledge bases

**Access:**
```javascript
const results = await plugin.search('articles', 'machine learning', {
  highlight: true,
  fuzzy: true
});
console.log(results[0].score);           // 0.85
console.log(results[0].matchedFields);   // ['title', 'content']
console.log(results[0].highlighted);     // { title: '<mark>Machine</mark>...' }
```

---

## Quick Start

```javascript
import { Database } from 's3db.js';
import { FullTextPlugin } from 's3db.js';

// Step 1: Create database
const db = new Database({ connectionString: 's3://key:secret@bucket' });
await db.connect();

// Step 2: Create a resource
const articles = await db.createResource({
  name: 'articles',
  attributes: {
    title: 'string|required',
    description: 'string',
    content: 'string|required'
  }
});

// Step 3: Configure full-text search
const fulltextPlugin = new FullTextPlugin({
  resources: {
    articles: {
      fields: ['title', 'description', 'content'],
      weights: {
        title: 3,        // Title matches are 3x more important
        description: 2,
        content: 1
      }
    }
  }
});

await db.usePlugin(fulltextPlugin);

// Step 4: Add articles (automatically indexed)
await articles.insert({
  title: 'Introduction to Machine Learning',
  description: 'A beginner-friendly guide to ML concepts',
  content: 'Machine learning is a subset of artificial intelligence...'
});

// Step 5: Search
const results = await fulltextPlugin.search('articles', 'machine learning');

results.forEach((result, index) => {
  console.log(`${index + 1}. ${result.title} (score: ${result.score.toFixed(2)})`);
  console.log(`   Matched in: ${result.matchedFields.join(', ')}`);
});

// Step 6: Search with highlighting
const highlightedResults = await fulltextPlugin.search('articles', 'machine learning', {
  highlight: true
});
console.log(highlightedResults[0].highlighted.title);
// Output: Introduction to <mark>Machine</mark> <mark>Learning</mark>

// Step 7: Fuzzy search (handles typos)
const fuzzyResults = await fulltextPlugin.search('articles', 'machne lerning', {
  fuzzy: true,
  maxDistance: 2
});
// Still finds "machine learning" despite typos!
```

---

## Dependencies

**Zero external dependencies** - built into s3db.js core.

**What's Included:**
- Tokenization engine (built-in)
- Inverted index storage (uses s3db resources)
- Relevance scoring (TF-IDF based)
- Highlighting engine (pure JavaScript)
- Fuzzy matching (Levenshtein distance)

---

## Documentation Index

| Guide | Description |
|-------|-------------|
| [Configuration](./guides/configuration.md) | All options, field weights, search result structure, API reference |
| [Usage Patterns](./guides/usage-patterns.md) | Basic search, advanced patterns, autocomplete, caching, analytics |
| [Best Practices](./guides/best-practices.md) | Performance optimization, troubleshooting, FAQ |

---

## Quick Reference

### Core Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable full-text search |
| `fields` | array | `[]` | Fields to index for search |
| `minWordLength` | number | `3` | Minimum word length for indexing |
| `maxResults` | number | `100` | Maximum search results to return |
| `stemming` | boolean | `false` | Enable word stemming |
| `fuzzySearch` | boolean | `false` | Enable fuzzy matching |
| `fieldWeights` | object | `{}` | Custom scoring weights per field |

### Search Methods

```javascript
// Basic search
await plugin.search('articles', 'javascript');

// Search with options
await plugin.search('articles', 'javascript', {
  limit: 20,
  highlight: true,
  fuzzy: true,
  minScore: 0.5
});

// Index management
await plugin.rebuildIndex('articles');
await plugin.clearIndex('articles');
const stats = await plugin.getIndexStats('articles');
```

### Search Result Structure

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

### Performance Guidelines

| Records | Typical Search Time |
|---------|-------------------|
| <1,000 | 10-50ms |
| 1,000-10,000 | 50-200ms |
| 10,000-100,000 | 200-1000ms |
| >100,000 | Consider dedicated search engine |

### Resources Created

For each plugin instance:
- `plg_fulltext_indexes` - Inverted index storage (word → record IDs)

---

## How It Works

1. **Automatic Indexing**: Indexes specified fields when records are created or updated
2. **Intelligent Scoring**: Ranks results by relevance using configurable field weights
3. **Advanced Processing**: Supports stemming, fuzzy search, and custom stop words
4. **Real-time Search**: Fast search with highlighting and filtering capabilities
5. **Multi-resource Support**: Search across multiple resources simultaneously

---

## Namespace Support

Run multiple FullTextPlugin instances:

```javascript
await db.usePlugin(new FullTextPlugin({
  namespace: 'catalog-search',
  resources: { products: { fields: ['name', 'description'] } }
}));

// Index storage becomes: plg_catalog-search_fulltext_indexes
```

---

## See Also

- [Cache Plugin](../cache/README.md) - Cache search results for better performance
- [Metrics Plugin](../metrics/README.md) - Monitor search performance and usage
- [Audit Plugin](../audit/README.md) - Track search operations and access patterns
