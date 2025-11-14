/**
 * # FullTextPlugin - Full-Text Search for s3db.js
 *
 * ## Overview
 *
 * The FullTextPlugin adds powerful full-text search capabilities to s3db.js, automatically
 * indexing specified fields and providing fast, flexible search across your resources.
 *
 * ## Features
 *
 * 1. **Automatic Indexing** - Automatically indexes text fields on insert/update/delete
 * 2. **Configurable Fields** - Choose which fields to index per resource
 * 3. **Tokenization** - Intelligent word tokenization with configurable minimum length
 * 4. **Partial Matching** - Support for both exact and partial word matching
 * 5. **Relevance Scoring** - Results ranked by relevance score
 * 6. **Persistent Indexes** - Indexes stored in S3 and loaded on startup
 * 7. **Incremental Updates** - Only changed indexes are saved (dirty tracking)
 * 8. **Index Management** - Rebuild, clear, and get statistics for indexes
 *
 * ## Configuration
 *
 * ```javascript
 * import { Database } from 's3db.js';
 * import { FullTextPlugin } from 's3db.js/plugins/fulltext';
 *
 * // Basic configuration
 * const db = new Database({
 *   connectionString: 's3://bucket/db'
 * });
 *
 * await db.use(new FullTextPlugin({
 *   minWordLength: 3,      // Minimum word length to index (default: 3)
 *   maxResults: 100,       // Maximum search results (default: 100)
 *   fields: ['title', 'description', 'content']  // Fields to index
 * }));
 *
 * // Per-resource field mapping
 * await db.use(new FullTextPlugin({
 *   minWordLength: 2,      // Index shorter words
 *   fields: {
 *     users: ['name', 'email', 'bio'],
 *     products: ['name', 'description', 'category'],
 *     articles: ['title', 'content', 'tags']
 *   }
 * }));
 * ```
 *
 * ## Usage Examples
 *
 * ### Basic Search
 *
 * ```javascript
 * const db = new Database({ connectionString: 's3://bucket/db' });
 * await db.use(new FullTextPlugin({
 *   fields: ['title', 'content']
 * }));
 * await db.start();
 *
 * const articles = await db.createResource({
 *   name: 'articles',
 *   attributes: {
 *     title: 'string',
 *     content: 'string',
 *     author: 'string'
 *   }
 * });
 *
 * // Insert articles (automatically indexed)
 * await articles.insert({
 *   id: 'a1',
 *   title: 'Getting Started with S3DB',
 *   content: 'S3DB is a document database built on AWS S3...',
 *   author: 'John Doe'
 * });
 *
 * // Search articles
 * const fulltextPlugin = db.pluginRegistry.FullTextPlugin;
 * const results = await fulltextPlugin.searchRecords('articles', 'S3DB database');
 *
 * console.log(results);
 * // [
 * //   {
 * //     id: 'a1',
 * //     title: 'Getting Started with S3DB',
 * //     content: 'S3DB is a document database...',
 * //     _searchScore: 2
 * //   }
 * // ]
 * ```
 *
 * ### Search with Options
 *
 * ```javascript
 * const fulltextPlugin = db.pluginRegistry.FullTextPlugin;
 *
 * // Exact match search
 * const exact = await fulltextPlugin.searchRecords('articles', 'database', {
 *   exactMatch: true,
 *   limit: 10
 * });
 *
 * // Partial match search (default)
 * const partial = await fulltextPlugin.searchRecords('articles', 'data', {
 *   exactMatch: false,
 *   limit: 20
 * });
 *
 * // Search specific fields
 * const titleOnly = await fulltextPlugin.searchRecords('articles', 'S3DB', {
 *   fields: ['title'],  // Search only title field
 *   limit: 5
 * });
 *
 * // Paginated search
 * const page2 = await fulltextPlugin.searchRecords('articles', 'database', {
 *   limit: 10,
 *   offset: 10  // Skip first 10 results
 * });
 * ```
 *
 * ### Search IDs Only
 *
 * ```javascript
 * // Get only record IDs and scores (faster)
 * const idResults = await fulltextPlugin.search('articles', 'database');
 *
 * console.log(idResults);
 * // [
 * //   { recordId: 'a1', score: 3 },
 * //   { recordId: 'a2', score: 2 },
 * //   { recordId: 'a3', score: 1 }
 * // ]
 *
 * // Fetch records manually if needed
 * const records = await articles.getMany(idResults.map(r => r.recordId));
 * ```
 *
 * ### Index Management
 *
 * ```javascript
 * const fulltextPlugin = db.pluginRegistry.FullTextPlugin;
 *
 * // Rebuild index for a resource
 * await fulltextPlugin.rebuildIndex('articles');
 *
 * // Rebuild all indexes
 * await fulltextPlugin.rebuildAllIndexes();
 *
 * // Rebuild with timeout
 * await fulltextPlugin.rebuildAllIndexes({ timeout: 30000 }); // 30 seconds
 *
 * // Get index statistics
 * const stats = await fulltextPlugin.getIndexStats();
 * console.log(stats);
 * // {
 * //   totalIndexes: 1523,
 * //   totalWords: 245,
 * //   resources: {
 * //     articles: {
 * //       totalRecords: 50,
 * //       totalWords: 150,
 * //       fields: {
 * //         title: { words: 75, totalOccurrences: 100 },
 * //         content: { words: 75, totalOccurrences: 200 }
 * //       }
 * //     }
 * //   }
 * // }
 *
 * // Clear specific resource index
 * await fulltextPlugin.clearIndex('articles');
 *
 * // Clear all indexes
 * await fulltextPlugin.clearAllIndexes();
 * ```
 *
 * ## Best Practices
 *
 * ### 1. Choose Fields Wisely
 *
 * ```javascript
 * // DON'T: Index all fields (wastes storage)
 * await db.use(new FullTextPlugin({
 *   fields: ['id', 'createdAt', 'updatedAt', 'title', 'content']  // ❌
 * }));
 *
 * // DO: Index only searchable text fields
 * await db.use(new FullTextPlugin({
 *   fields: ['title', 'content', 'tags']  // ✅
 * }));
 * ```
 *
 * ### 2. Configure Minimum Word Length
 *
 * ```javascript
 * // For general text (articles, blogs)
 * await db.use(new FullTextPlugin({
 *   minWordLength: 3  // Skip "a", "an", "the", etc.
 * }));
 *
 * // For technical content (code, IDs)
 * await db.use(new FullTextPlugin({
 *   minWordLength: 2  // Allow shorter terms like "id", "db"
 * }));
 *
 * // For specialized content (medical, legal)
 * await db.use(new FullTextPlugin({
 *   minWordLength: 4  // More selective indexing
 * }));
 * ```
 *
 * ### 3. Rebuild Indexes After Schema Changes
 *
 * ```javascript
 * // After changing indexed fields
 * await db.use(new FullTextPlugin({
 *   fields: ['title', 'content', 'summary']  // Added 'summary'
 * }));
 *
 * // Rebuild indexes to include new field
 * const fulltextPlugin = db.pluginRegistry.FullTextPlugin;
 * await fulltextPlugin.rebuildAllIndexes();
 * ```
 *
 * ### 4. Use Exact Match for Precision
 *
 * ```javascript
 * // For user search: partial match (more results)
 * const userSearch = await fulltextPlugin.searchRecords('articles', query, {
 *   exactMatch: false
 * });
 *
 * // For filtering: exact match (precise results)
 * const filtered = await fulltextPlugin.searchRecords('articles', 'database', {
 *   exactMatch: true
 * });
 * ```
 *
 * ## Performance Considerations
 *
 * ### Indexing Performance
 *
 * - **Insert**: +10-50ms per record (depending on text length)
 * - **Update**: +20-100ms per record (remove old + add new index)
 * - **Delete**: +10-30ms per record (remove from index)
 * - **Storage**: ~100-500 bytes per indexed word
 *
 * ### Search Performance
 *
 * | Records | Indexed Words | Search Time |
 * |---------|---------------|-------------|
 * | 1,000 | 5,000 | ~10ms |
 * | 10,000 | 50,000 | ~50ms |
 * | 100,000 | 500,000 | ~200ms |
 *
 * ### Optimization Tips
 *
 * ```javascript
 * // 1. Use search() instead of searchRecords() when you don't need full records
 * const ids = await fulltextPlugin.search('articles', 'database');  // Fast
 * const records = await fulltextPlugin.searchRecords('articles', 'database');  // Slower
 *
 * // 2. Limit results
 * const results = await fulltextPlugin.searchRecords('articles', 'database', {
 *   limit: 20  // Faster than fetching 100+ results
 * });
 *
 * // 3. Search specific fields
 * const titleResults = await fulltextPlugin.searchRecords('articles', 'database', {
 *   fields: ['title']  // Faster than searching all fields
 * });
 *
 * // 4. Use pagination for large result sets
 * for (let offset = 0; offset < total; offset += 50) {
 *   const page = await fulltextPlugin.searchRecords('articles', 'database', {
 *     limit: 50,
 *     offset
 *   });
 *   processPage(page);
 * }
 * ```
 *
 * ## Troubleshooting
 *
 * ### Search Returns No Results
 *
 * ```javascript
 * // Check if fields are configured
 * const plugin = db.pluginRegistry.FullTextPlugin;
 * console.log(plugin.config.fields);  // Should include the fields you're searching
 *
 * // Check index statistics
 * const stats = await plugin.getIndexStats();
 * console.log(stats.resources.articles);  // Should show indexed words
 *
 * // Rebuild index if needed
 * await plugin.rebuildIndex('articles');
 * ```
 *
 * ### Search Too Slow
 *
 * ```javascript
 * // Solution 1: Reduce minWordLength to index fewer words
 * await db.use(new FullTextPlugin({
 *   minWordLength: 4  // More selective
 * }));
 *
 * // Solution 2: Limit search fields
 * const results = await plugin.searchRecords('articles', query, {
 *   fields: ['title']  // Search only title, not content
 * });
 *
 * // Solution 3: Use exact match
 * const results = await plugin.searchRecords('articles', query, {
 *   exactMatch: true  // Faster than partial matching
 * });
 * ```
 *
 * ### Index Growing Too Large
 *
 * ```javascript
 * // Check index size
 * const stats = await plugin.getIndexStats();
 * console.log(`Total indexes: ${stats.totalIndexes}`);
 * console.log(`Total words: ${stats.totalWords}`);
 *
 * // Solution 1: Increase minWordLength
 * await db.use(new FullTextPlugin({
 *   minWordLength: 4  // Index fewer words
 * }));
 * await plugin.rebuildAllIndexes();
 *
 * // Solution 2: Index fewer fields
 * await db.use(new FullTextPlugin({
 *   fields: ['title']  // Don't index long content fields
 * }));
 * await plugin.rebuildAllIndexes();
 *
 * // Solution 3: Clear old indexes
 * await plugin.clearIndex('old_resource');
 * ```
 *
 * ### Indexes Not Persisting
 *
 * ```javascript
 * // Indexes save automatically on plugin stop
 * await db.stop();  // Ensures indexes are saved
 *
 * // Or manually save
 * await plugin.saveIndexes();
 *
 * // Check if index resource exists
 * console.log(db.resources.plg_fulltext_indexes);  // Should exist
 * ```
 *
 * ## Real-World Use Cases
 *
 * ### 1. Article/Blog Search
 *
 * ```javascript
 * const plugin = new FullTextPlugin({
 *   fields: ['title', 'content', 'tags'],
 *   minWordLength: 3
 * });
 *
 * // User searches for "javascript database"
 * const results = await plugin.searchRecords('articles', 'javascript database', {
 *   limit: 10
 * });
 *
 * // Display results with highlights
 * results.forEach(article => {
 *   console.log(`${article.title} (score: ${article._searchScore})`);
 * });
 * ```
 *
 * ### 2. Product Search
 *
 * ```javascript
 * const plugin = new FullTextPlugin({
 *   fields: ['name', 'description', 'category', 'brand'],
 *   minWordLength: 2
 * });
 *
 * // Search for "laptop gaming"
 * const products = await plugin.searchRecords('products', 'laptop gaming', {
 *   limit: 20
 * });
 *
 * // Filter by category after search
 * const electronics = products.filter(p => p.category === 'Electronics');
 * ```
 *
 * ### 3. User Directory Search
 *
 * ```javascript
 * const plugin = new FullTextPlugin({
 *   fields: ['name', 'email', 'department', 'title'],
 *   minWordLength: 2
 * });
 *
 * // Search for "john engineer"
 * const users = await plugin.searchRecords('users', 'john engineer', {
 *   limit: 10
 * });
 * ```
 *
 * ### 4. Documentation Search
 *
 * ```javascript
 * const plugin = new FullTextPlugin({
 *   fields: ['title', 'content', 'category'],
 *   minWordLength: 3
 * });
 *
 * // Search docs with exact match for technical terms
 * const exactResults = await plugin.searchRecords('docs', 'insert()', {
 *   exactMatch: true
 * });
 *
 * // Fallback to partial match if no results
 * if (exactResults.length === 0) {
 *   const partialResults = await plugin.searchRecords('docs', 'insert', {
 *     exactMatch: false
 *   });
 * }
 * ```
 *
 * ## API Reference
 *
 * ### Constructor Options
 *
 * - `minWordLength` (number, default: 3) - Minimum word length to index
 * - `maxResults` (number, default: 100) - Maximum search results
 * - `fields` (string[] | object) - Fields to index (array or per-resource mapping)
 *
 * ### Methods
 *
 * - `search(resourceName, query, options)` - Search and return IDs with scores
 * - `searchRecords(resourceName, query, options)` - Search and return full records
 * - `rebuildIndex(resourceName)` - Rebuild index for a resource
 * - `rebuildAllIndexes(options)` - Rebuild all indexes
 * - `getIndexStats()` - Get index statistics
 * - `clearIndex(resourceName)` - Clear specific resource index
 * - `clearAllIndexes()` - Clear all indexes
 * - `saveIndexes()` - Manually save indexes to S3
 *
 * ### Search Options
 *
 * ```typescript
 * interface SearchOptions {
 *   fields?: string[];      // Specific fields to search
 *   limit?: number;         // Max results (default: maxResults from config)
 *   offset?: number;        // Pagination offset (default: 0)
 *   exactMatch?: boolean;   // Exact vs partial matching (default: false)
 * }
 * ```
 *
 * ### Search Result Structure
 *
 * ```typescript
 * // search() returns
 * interface SearchResult {
 *   recordId: string;
 *   score: number;  // Higher = more relevant
 * }
 *
 * // searchRecords() returns
 * interface SearchRecord extends ResourceRecord {
 *   _searchScore: number;  // Added to each record
 * }
 * ```
 *
 * ## Notes
 *
 * - Indexes are stored in `plg_fulltext_indexes` resource
 * - Tokenization preserves accented characters (é, ñ, etc.)
 * - Case-insensitive search
 * - Special characters are removed during tokenization
 * - Nested field paths supported (e.g., 'profile.bio')
 * - Indexes save automatically on plugin stop
 * - Dirty tracking ensures only changed indexes are saved
 */

import { Plugin } from "./plugin.class.js";
import tryFn from "../concerns/try-fn.js";
import { FulltextError } from "./fulltext.errors.js";
import { resolveResourceName } from "./concerns/resource-names.js";

export class FullTextPlugin extends Plugin {
  constructor(options = {}) {
    super(options);
    this.indexResource = null;
    const opts = this.options;
    const resourceNamesOption = opts.resourceNames || {};
    this._indexResourceDescriptor = {
      defaultName: 'plg_fulltext_indexes',
      override: resourceNamesOption.index || opts.indexResource
    };
    this.indexResourceName = this._resolveIndexResourceName();
    this.config = {
      minWordLength: opts.minWordLength || 3,
      maxResults: opts.maxResults || 100,
      verbose: this.verbose,
      ...opts
    };
    this.indexes = new Map(); // In-memory index for simplicity
    this.dirtyIndexes = new Set(); // Track changed index keys for incremental saves
    this.deletedIndexes = new Set(); // Track deleted index keys
  }

  _resolveIndexResourceName() {
    return resolveResourceName('fulltext', this._indexResourceDescriptor, {
      namespace: this.namespace
    });
  }

  onNamespaceChanged() {
    this.indexResourceName = this._resolveIndexResourceName();
  }

  async onInstall() {
    
    // Create index resource if it doesn't exist
    const [ok, err, indexResource] = await tryFn(() => this.database.createResource({
        name: this.indexResourceName,
        attributes: {
          id: 'string|required',
          resourceName: 'string|required',
          fieldName: 'string|required',
          word: 'string|required',
          recordIds: 'json|required', // Array of record IDs containing this word
          count: 'number|required',
          lastUpdated: 'string|required'
        },
        partitions: {
          byResource: { fields: { resourceName: 'string' } }
        },
        behavior: 'body-overflow'
      }));
    if (ok) {
      this.indexResource = indexResource;
    } else if (this.database.resources[this.indexResourceName]) {
      this.indexResource = this.database.resources[this.indexResourceName];
    } else {
      throw err;
    }

    // Load existing indexes
    await this.loadIndexes();
    
    // Use database hooks for automatic resource discovery
    this.installDatabaseHooks();
    
    // Install hooks for existing resources
    this.installIndexingHooks();
  }

  async start() {
    // Plugin is ready
  }

  async stop() {
    // Save indexes before stopping
    await this.saveIndexes();
    
    // Remove database hooks
    this.removeDatabaseHooks();
  }

  isInternalResource(name) {
    return name === this.indexResourceName || name === 'plg_fulltext_indexes';
  }

  async loadIndexes() {
    if (!this.indexResource) return;
    
    const [ok, err, allIndexes] = await tryFn(() => this.indexResource.getAll());
    if (ok) {
      for (const indexRecord of allIndexes) {
        const key = `${indexRecord.resourceName}:${indexRecord.fieldName}:${indexRecord.word}`;
        this.indexes.set(key, {
          recordIds: indexRecord.recordIds || [],
          count: indexRecord.count || 0
        });
      }
    }
  }

  async saveIndexes() {
    if (!this.indexResource) return;

    const [ok, err] = await tryFn(async () => {
      // Delete indexes that were removed
      for (const key of this.deletedIndexes) {
        // Find and delete the index record using partition-aware query
        const [resourceName] = key.split(':');
        const [queryOk, queryErr, results] = await tryFn(() =>
          this.indexResource.query({ resourceName })
        );

        if (queryOk && results) {
          for (const index of results) {
            const indexKey = `${index.resourceName}:${index.fieldName}:${index.word}`;
            if (indexKey === key) {
              await this.indexResource.delete(index.id);
            }
          }
        }
      }

      // Save or update dirty indexes
      for (const key of this.dirtyIndexes) {
        const [resourceName, fieldName, word] = key.split(':');
        const data = this.indexes.get(key);

        if (!data) continue; // Skip if index was deleted

        // Try to find existing index record
        const [queryOk, queryErr, results] = await tryFn(() =>
          this.indexResource.query({ resourceName })
        );

        let existingRecord = null;
        if (queryOk && results) {
          existingRecord = results.find(
            (index) => index.resourceName === resourceName &&
                      index.fieldName === fieldName &&
                      index.word === word
          );
        }

        if (existingRecord) {
          // Update existing record
          await this.indexResource.update(existingRecord.id, {
            recordIds: data.recordIds,
            count: data.count,
            lastUpdated: new Date().toISOString()
          });
        } else {
          // Insert new record
          await this.indexResource.insert({
            id: `index-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            resourceName,
            fieldName,
            word,
            recordIds: data.recordIds,
            count: data.count,
            lastUpdated: new Date().toISOString()
          });
        }
      }

      // Clear tracking sets after successful save
      this.dirtyIndexes.clear();
      this.deletedIndexes.clear();
    });
  }

  installDatabaseHooks() {
    // Use the new database hooks system for automatic resource discovery
    this.database.addHook('afterCreateResource', (resource) => {
      if (!this.isInternalResource(resource.name)) {
        this.installResourceHooks(resource);
      }
    });
  }

  removeDatabaseHooks() {
    // Remove the hook we added
    this.database.removeHook('afterCreateResource', this.installResourceHooks.bind(this));
  }

  installIndexingHooks() {
    // Register plugin with database
    if (!this.database.pluginRegistry) {
      this.database.pluginRegistry = {};
    }
    this.database.pluginRegistry.fulltext = this;

    for (const resource of Object.values(this.database.resources)) {
      if (this.isInternalResource(resource.name)) continue;
      
      this.installResourceHooks(resource);
    }

    // Hook into database proxy for new resources (check if already installed)
    if (!this.database._fulltextProxyInstalled) {
      // Store the previous createResource (could be another plugin's proxy)
      this.database._previousCreateResourceForFullText = this.database.createResource;
      this.database.createResource = async function (...args) {
        const resource = await this._previousCreateResourceForFullText(...args);
      if (this.pluginRegistry?.fulltext && !this.pluginRegistry.fulltext.isInternalResource(resource.name)) {
        this.pluginRegistry.fulltext.installResourceHooks(resource);
      }
        return resource;
      };
      this.database._fulltextProxyInstalled = true;
    }

    // Ensure all existing resources have hooks (even if created before plugin setup)
    for (const resource of Object.values(this.database.resources)) {
      if (!this.isInternalResource(resource.name)) {
        this.installResourceHooks(resource);
      }
    }
  }

  installResourceHooks(resource) {
    // Store original methods
    resource._insert = resource.insert;
    resource._update = resource.update;
    resource._delete = resource.delete;
    resource._deleteMany = resource.deleteMany;

    // Use wrapResourceMethod for all hooks so _pluginWrappers is set
    this.wrapResourceMethod(resource, 'insert', async (result, args, methodName) => {
      const [data] = args;
      // Index the new record
      this.indexRecord(resource.name, result.id, data).catch(() => {});
      return result;
    });

    this.wrapResourceMethod(resource, 'update', async (result, args, methodName) => {
      const [id, data] = args;
      // Remove old index entries
      this.removeRecordFromIndex(resource.name, id).catch(() => {});
      // Index the updated record
      this.indexRecord(resource.name, id, result).catch(() => {});
      return result;
    });

    this.wrapResourceMethod(resource, 'delete', async (result, args, methodName) => {
      const [id] = args;
      // Remove from index
      this.removeRecordFromIndex(resource.name, id).catch(() => {});
      return result;
    });

    this.wrapResourceMethod(resource, 'deleteMany', async (result, args, methodName) => {
      const [ids] = args;
      // Remove from index
      for (const id of ids) {
        this.removeRecordFromIndex(resource.name, id).catch(() => {});
      }
      return result;
    });
  }

  async indexRecord(resourceName, recordId, data) {
    const indexedFields = this.getIndexedFields(resourceName);
    if (!indexedFields || indexedFields.length === 0) {
      return;
    }

    for (const fieldName of indexedFields) {
      const fieldValue = this.getFieldValue(data, fieldName);
      if (!fieldValue) {
        continue;
      }

      const words = this.tokenize(fieldValue);

      for (const word of words) {
        if (word.length < this.config.minWordLength) {
          continue;
        }

        const key = `${resourceName}:${fieldName}:${word.toLowerCase()}`;
        const existing = this.indexes.get(key) || { recordIds: [], count: 0 };

        if (!existing.recordIds.includes(recordId)) {
          existing.recordIds.push(recordId);
          existing.count = existing.recordIds.length;
        }

        this.indexes.set(key, existing);
        this.dirtyIndexes.add(key); // Mark as dirty for incremental save
      }
    }
  }

  async removeRecordFromIndex(resourceName, recordId) {
    for (const [key, data] of this.indexes.entries()) {
      if (key.startsWith(`${resourceName}:`)) {
        const index = data.recordIds.indexOf(recordId);
        if (index > -1) {
          data.recordIds.splice(index, 1);
          data.count = data.recordIds.length;

          if (data.recordIds.length === 0) {
            this.indexes.delete(key);
            this.deletedIndexes.add(key); // Track deletion for incremental save
          } else {
            this.indexes.set(key, data);
            this.dirtyIndexes.add(key); // Mark as dirty for incremental save
          }
        }
      }
    }
  }

  getFieldValue(data, fieldPath) {
    if (!fieldPath.includes('.')) {
      return data && data[fieldPath] !== undefined ? data[fieldPath] : null;
    }
    
    const keys = fieldPath.split('.');
    let value = data;
    
    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return null;
      }
    }
    
    return value;
  }

  tokenize(text) {
    if (!text) return [];
    
    // Convert to string and normalize
    const str = String(text).toLowerCase();
    
    // Remove special characters but preserve accented characters
    return str
      .replace(/[^\w\s\u00C0-\u017F]/g, ' ') // Allow accented characters
      .split(/\s+/)
      .filter(word => word.length > 0);
  }

  getIndexedFields(resourceName) {
    // Use configured fields if available, otherwise fall back to defaults
    if (this.config.fields) {
      return this.config.fields;
    }
    
    // Default field mappings
    const fieldMappings = {
      users: ['name', 'email'],
      products: ['name', 'description'],
      articles: ['title', 'content'],
      // Add more mappings as needed
    };
    
    return fieldMappings[resourceName] || [];
  }

  // Main search method
  async search(resourceName, query, options = {}) {
    const {
      fields = null, // Specific fields to search in
      limit = this.config.maxResults,
      offset = 0,
      exactMatch = false
    } = options;

    if (!query || query.trim().length === 0) {
      return [];
    }

    const searchWords = this.tokenize(query);
    const results = new Map(); // recordId -> score

    // Get fields to search in
    const searchFields = fields || this.getIndexedFields(resourceName);
    if (searchFields.length === 0) {
      return [];
    }

    // Search for each word
    for (const word of searchWords) {
      if (word.length < this.config.minWordLength) continue;
      
      for (const fieldName of searchFields) {
        if (exactMatch) {
          // Exact match - look for the exact word
          const key = `${resourceName}:${fieldName}:${word.toLowerCase()}`;
          const indexData = this.indexes.get(key);
          
          if (indexData) {
            for (const recordId of indexData.recordIds) {
              const currentScore = results.get(recordId) || 0;
              results.set(recordId, currentScore + 1);
            }
          }
        } else {
          // Partial match - look for words that start with the search term
          for (const [key, indexData] of this.indexes.entries()) {
            if (key.startsWith(`${resourceName}:${fieldName}:${word.toLowerCase()}`)) {
              for (const recordId of indexData.recordIds) {
                const currentScore = results.get(recordId) || 0;
                results.set(recordId, currentScore + 1);
              }
            }
          }
        }
      }
    }

    // Convert to sorted results
    const sortedResults = Array.from(results.entries())
      .map(([recordId, score]) => ({ recordId, score }))
      .sort((a, b) => b.score - a.score)
      .slice(offset, offset + limit);

    return sortedResults;
  }

  // Search and return full records
  async searchRecords(resourceName, query, options = {}) {
    const searchResults = await this.search(resourceName, query, options);

    if (searchResults.length === 0) {
      return [];
    }

    const resource = this.database.resources[resourceName];
    if (!resource) {
      throw new FulltextError(`Resource '${resourceName}' not found`, {
        operation: 'searchRecords',
        resourceName,
        query,
        availableResources: Object.keys(this.database.resources),
        suggestion: 'Check resource name or ensure resource is created before searching'
      });
    }

    const recordIds = searchResults.map(result => result.recordId);
    const records = await resource.getMany(recordIds);

    // Filter out undefined/null records (in case getMany returns missing records)
    const result = records
      .filter(record => record && typeof record === 'object')
      .map(record => {
        const searchResult = searchResults.find(sr => sr.recordId === record.id);
        return {
          ...record,
          _searchScore: searchResult ? searchResult.score : 0
        };
      })
      .sort((a, b) => b._searchScore - a._searchScore);
    return result;
  }

  // Utility methods
  async rebuildIndex(resourceName) {
    const resource = this.database.resources[resourceName];
    if (!resource) {
      throw new FulltextError(`Resource '${resourceName}' not found`, {
        operation: 'rebuildIndex',
        resourceName,
        availableResources: Object.keys(this.database.resources),
        suggestion: 'Check resource name or ensure resource is created before rebuilding index'
      });
    }

    // Clear existing indexes for this resource
    for (const [key] of this.indexes.entries()) {
      if (key.startsWith(`${resourceName}:`)) {
        this.indexes.delete(key);
      }
    }

    // Rebuild index in larger batches for better performance
    const allRecords = await resource.getAll();
    const batchSize = 100; // Increased batch size for faster processing
    
    for (let i = 0; i < allRecords.length; i += batchSize) {
      const batch = allRecords.slice(i, i + batchSize);
      // Process batch sequentially to avoid overwhelming the system
      for (const record of batch) {
        const [ok, err] = await tryFn(() => this.indexRecord(resourceName, record.id, record));
        if (!ok) {
        }
      }
    }

    // Save indexes
    await this.saveIndexes();
  }

  async getIndexStats() {
    const stats = {
      totalIndexes: this.indexes.size,
      resources: {},
      totalWords: 0
    };

    for (const [key, data] of this.indexes.entries()) {
      const [resourceName, fieldName] = key.split(':');
      
      if (!stats.resources[resourceName]) {
        stats.resources[resourceName] = {
          fields: {},
          totalRecords: new Set(),
          totalWords: 0
        };
      }
      
      if (!stats.resources[resourceName].fields[fieldName]) {
        stats.resources[resourceName].fields[fieldName] = {
          words: 0,
          totalOccurrences: 0
        };
      }
      
      stats.resources[resourceName].fields[fieldName].words++;
      stats.resources[resourceName].fields[fieldName].totalOccurrences += data.count;
      stats.resources[resourceName].totalWords++;
      
      for (const recordId of data.recordIds) {
        stats.resources[resourceName].totalRecords.add(recordId);
      }
      
      stats.totalWords++;
    }

    // Convert Sets to counts
    for (const resourceName in stats.resources) {
      stats.resources[resourceName].totalRecords = stats.resources[resourceName].totalRecords.size;
    }

    return stats;
  }

  async rebuildAllIndexes({ timeout } = {}) {
    if (timeout) {
      return Promise.race([
        this._rebuildAllIndexesInternal(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeout))
      ]);
    }
    return this._rebuildAllIndexesInternal();
  }

  async _rebuildAllIndexesInternal() {
    const resourceNames = Object.keys(this.database.resources).filter(name => !this.isInternalResource(name));
    
    // Process resources sequentially to avoid overwhelming the system
    for (const resourceName of resourceNames) {
      const [ok, err] = await tryFn(() => this.rebuildIndex(resourceName));
      if (!ok) {
      }
    }
  }

  async clearIndex(resourceName) {
    // Clear indexes for specific resource
    for (const [key] of this.indexes.entries()) {
      if (key.startsWith(`${resourceName}:`)) {
        this.indexes.delete(key);
      }
    }
    
    // Save changes
    await this.saveIndexes();
  }

  async clearAllIndexes() {
    // Clear all indexes
    this.indexes.clear();
    
    // Save changes
    await this.saveIndexes();
  }
} 
