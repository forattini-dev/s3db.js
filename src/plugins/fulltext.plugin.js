import Plugin from "./plugin.class.js";
import tryFn from "../concerns/try-fn.js";

export class FullTextPlugin extends Plugin {
  constructor(options = {}) {
    super();
    this.indexResource = null;
    this.config = {
      minWordLength: options.minWordLength || 3,
      maxResults: options.maxResults || 100,
      ...options
    };
    this.indexes = new Map(); // In-memory index for simplicity
  }

  async setup(database) {
    this.database = database;
    
    // Create index resource if it doesn't exist
    const [ok, err, indexResource] = await tryFn(() => database.createResource({
        name: 'plg_fulltext_indexes',
        attributes: {
          id: 'string|required',
          resourceName: 'string|required',
          fieldName: 'string|required',
          word: 'string|required',
          recordIds: 'json|required', // Array of record IDs containing this word
          count: 'number|required',
          lastUpdated: 'string|required'
        }
      }));
    this.indexResource = ok ? indexResource : database.resources.fulltext_indexes;

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
      // Clear existing indexes
      const existingIndexes = await this.indexResource.getAll();
      for (const index of existingIndexes) {
        await this.indexResource.delete(index.id);
      }
      // Save current indexes
      for (const [key, data] of this.indexes.entries()) {
        const [resourceName, fieldName, word] = key.split(':');
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
    });
  }

  installDatabaseHooks() {
    // Use the new database hooks system for automatic resource discovery
    this.database.addHook('afterCreateResource', (resource) => {
      if (resource.name !== 'plg_fulltext_indexes') {
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
    if (!this.database.plugins) {
      this.database.plugins = {};
    }
    this.database.plugins.fulltext = this;

    for (const resource of Object.values(this.database.resources)) {
      if (resource.name === 'plg_fulltext_indexes') continue;
      
      this.installResourceHooks(resource);
    }

    // Hook into database proxy for new resources (check if already installed)
    if (!this.database._fulltextProxyInstalled) {
      // Store the previous createResource (could be another plugin's proxy)
      this.database._previousCreateResourceForFullText = this.database.createResource;
      this.database.createResource = async function (...args) {
        const resource = await this._previousCreateResourceForFullText(...args);
        if (this.plugins?.fulltext && resource.name !== 'plg_fulltext_indexes') {
          this.plugins.fulltext.installResourceHooks(resource);
        }
        return resource;
      };
      this.database._fulltextProxyInstalled = true;
    }

    // Ensure all existing resources have hooks (even if created before plugin setup)
    for (const resource of Object.values(this.database.resources)) {
      if (resource.name !== 'plg_fulltext_indexes') {
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
          } else {
            this.indexes.set(key, data);
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
      throw new Error(`Resource '${resourceName}' not found`);
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
      throw new Error(`Resource '${resourceName}' not found`);
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
    const resourceNames = Object.keys(this.database.resources).filter(name => name !== 'plg_fulltext_indexes');
    
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

export default FullTextPlugin; 