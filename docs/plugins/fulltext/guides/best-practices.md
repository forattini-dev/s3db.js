# Best Practices & FAQ

> **In this guide:** Recommendations, performance optimization, troubleshooting, and FAQ.

**Navigation:** [← Back to FullText Plugin](../README.md) | [Configuration](./configuration.md)

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

### 4. Handle Large Datasets

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

### 5. Monitor Search Performance

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

### 6. Regular Index Maintenance

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

## Performance Guidelines

### Search Speed by Dataset Size

| Records | Typical Search Time |
|---------|-------------------|
| <1,000 | 10-50ms |
| 1,000-10,000 | 50-200ms |
| 10,000-100,000 | 200-1000ms |
| >100,000 | Consider dedicated search engine |

### Optimization Tips

1. **Use specific `fields`** instead of searching all fields
2. **Use low `limit`** to return only relevant results
3. **Use `exactMatch: true`** when possible
4. **Consider pagination** with `offset`
5. **Cache frequent search results**
6. **Use higher `minWordLength`** to reduce index size

### Handling Large Text Fields (>10KB)

- Increase `minWordLength` to reduce index size
- Use more stop words to filter common terms
- Index only important sections (summary, title)

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

### Issue: Common words not indexed
**Cause**: They're in the stop words list.
```javascript
console.log(plugin.config.stopWords);
```

### Issue: Index not updating after record changes
**Solution**: Verify plugin is installed correctly:
```javascript
console.log(db.plugins); // Should include FullTextPlugin
```

### Issue: Search results have low scores
**Solution**: Scores are relative. To improve:
1. Adjust field weights (boost important fields)
2. Remove more stop words
3. Use exact match for precision
4. Filter by minimum score threshold

### Issue: Can't find recently inserted records
**Cause**: Indexes might be rebuilding. Check:
```javascript
const stats = await plugin.getIndexStats();
console.log('Last indexed:', stats.lastIndexed);
```

---

## Debug Mode

Query the index resource directly:

```javascript
const indexes = await db.resources.plg_fulltext_indexes.list();
console.log(indexes);
// Shows all indexed words, frequencies, and record IDs
```

---

## FAQ

### General

**Q: What does the FullTextPlugin do?**
A: Adds full-text search on text fields using inverted indexes stored in S3, similar to Elasticsearch but using S3DB.

**Q: How does indexing work?**
A: Tokenizes text, creates inverted indexes (word → record IDs) and stores them in the `plg_fulltext_indexes` resource.

**Q: Does it support accents and special characters?**
A: Yes, preserves accented characters (full UTF-8) and automatically normalizes during tokenization.

**Q: Do I need to install any external dependencies?**
A: No! FullTextPlugin is built into s3db.js core with zero external dependencies.

**Q: What languages are supported?**
A: Currently optimized for English (en-US), but works with any UTF-8 text. Language-specific stemming requires configuration.

**Q: Is it suitable for production use?**
A: Yes for small-medium datasets (<1M records). For larger volumes, consider dedicated solutions like Elasticsearch or Typesense.

### Configuration

**Q: How to configure which fields to index?**
A: Use the `resources` option:
```javascript
new FullTextPlugin({
  resources: {
    articles: {
      fields: ['title', 'description', 'content'],
      weights: { title: 3, description: 2, content: 1 }
    }
  }
})
```

**Q: How to configure minimum word length?**
A: Use `minWordLength`:
```javascript
new FullTextPlugin({
  minWordLength: 2  // Index words with 2+ characters (default: 3)
})
```

**Q: Can I index multiple resources?**
A: Yes! Configure each resource separately:
```javascript
new FullTextPlugin({
  resources: {
    articles: { fields: ['title', 'content'] },
    products: { fields: ['name', 'description', 'tags'] },
    users: { fields: ['name', 'bio'] }
  }
})
```

**Q: Can I customize stop words?**
A: Yes, provide your own list:
```javascript
new FullTextPlugin({
  stopWords: ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at']
})
```

**Q: How to enable fuzzy search?**
A: Set `fuzzySearch: true`:
```javascript
new FullTextPlugin({
  fuzzySearch: true,
  maxDistance: 2  // Allow 2 character differences
})
```

### Operations

**Q: What's returned from a search?**
A: Array of records with metadata:
```javascript
[
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
]
```

**Q: What's the difference between exact match and partial match?**
A:
- `exactMatch: true` - Only matches complete words ("java" doesn't match "javascript")
- `exactMatch: false` (default) - Matches word prefixes ("java" matches "javascript")

**Q: How to rebuild indexes?**
A: Use `rebuildIndex()`:
```javascript
// Rebuild a single resource
await plugin.rebuildIndex('articles');

// Rebuild all resources
await plugin.rebuildAllIndexes();
```

**Q: Are indexes updated automatically?**
A: Yes! The plugin automatically hooks into insert/update/delete operations and updates indexes in real-time.

**Q: How often should I rebuild indexes?**
A: Rarely needed since indexes update automatically. Rebuild if:
- You changed field configuration
- You suspect index corruption
- After bulk data migration

**Q: How much storage do indexes use?**
A: Approximately 10-30% of your original text data size. Use `getIndexStats()` to see actual size.

**Q: Can I disable auto-indexing temporarily?**
A: Yes, remove the plugin temporarily:
```javascript
// Disable
await db.removePlugin('fulltext');

// Re-enable
await db.usePlugin(new FullTextPlugin({ /* config */ }));
await plugin.rebuildAllIndexes();
```

### Performance

**Q: What is the performance impact of indexing?**
A: Minimal on read operations. Inserts/updates are ~10-30% slower due to tokenization and index updates.

**Q: Does search performance degrade with more records?**
A: Yes, linearly. Each search scans the index. For large datasets (>100k records), consider:
- Using partitions to segment indexes
- Caching search results
- Upgrading to Elasticsearch/Typesense

### Advanced

**Q: Can I use custom tokenizers?**
A: Not directly, but you can pre-process text before indexing:
```javascript
articles.addHook('beforeInsert', (data) => {
  data.searchableContent = customTokenize(data.content);
  return data;
});
```

**Q: How to implement autocomplete?**
A: Query the index resource for word suggestions:
```javascript
const indexes = await db.resources.plg_fulltext_indexes.list();
const suggestions = indexes
  .filter(idx => idx.word.startsWith(partial))
  .sort((a, b) => b.frequency - a.frequency)
  .slice(0, 10)
  .map(idx => idx.word);
```

**Q: Can I combine with other plugins?**
A: Yes! Works well with:
- **CachePlugin**: Cache search results
- **MetricsPlugin**: Track search performance
- **AuditPlugin**: Log search queries

**Q: How to test search functionality?**
A: Create a test suite:
```javascript
import { Database, FullTextPlugin, MemoryClient } from 's3db.js';

const db = new Database({ client: new MemoryClient() });
await db.usePlugin(new FullTextPlugin({
  resources: { test: { fields: ['title'] } }
}));

const test = await db.createResource({
  name: 'test',
  attributes: { title: 'string' }
});

await test.insert({ title: 'Hello World' });
const results = await plugin.search('test', 'hello');
console.assert(results.length === 1);
```

---

## See Also

- [Configuration](./configuration.md) - All options and API reference
- [Usage Patterns](./usage-patterns.md) - Examples and use cases
