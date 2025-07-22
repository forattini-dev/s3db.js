import tryFn from "#src/concerns/try-fn.js";
import { S3db } from '#src/database.class.js';
import BaseReplicator from './base-replicator.class.js';

function normalizeResourceName(name) {
  return typeof name === 'string' ? name.trim().toLowerCase() : name;
}

/**
 * S3DB Replicator - Replicate data to another S3DB instance
 * 
 * Configuration:
 * @param {string} connectionString - S3DB connection string for destination database (required)
 * @param {Object} client - Pre-configured S3DB client instance (alternative to connectionString)
 * @param {Object} resources - Resource mapping configuration
 * 
 * @example
 * new S3dbReplicator({
 *   connectionString: "s3://BACKUP_KEY:BACKUP_SECRET@BACKUP_BUCKET/backup"
 * }, {
 *   users: 'backup_users',
 *   orders: {
 *     resource: 'order_backup',
 *     transformer: (data) => ({ ...data, backup_timestamp: new Date().toISOString() })
 *   }
 * })
 * 
 * See PLUGINS.md for comprehensive configuration documentation.
 */
class S3dbReplicator extends BaseReplicator {
  constructor(config = {}, resources = [], client = null) {
    super(config);
    this.instanceId = Math.random().toString(36).slice(2, 10);
    this.client = client;
    this.connectionString = config.connectionString;
    // Robustness: ensure object
    let normalizedResources = resources;
    if (!resources) normalizedResources = {};
    else if (Array.isArray(resources)) {
      normalizedResources = {};
      for (const res of resources) {
        if (typeof res === 'string') normalizedResources[normalizeResourceName(res)] = res;
      }
    } else if (typeof resources === 'string') {
      normalizedResources[normalizeResourceName(resources)] = resources;
    }
    this.resourcesMap = this._normalizeResources(normalizedResources);
  }

  _normalizeResources(resources) {
    // Supports object, function, string, and arrays of destination configurations
    if (!resources) return {};
    if (Array.isArray(resources)) {
      const map = {};
      for (const res of resources) {
        if (typeof res === 'string') map[normalizeResourceName(res)] = res;
        else if (typeof res === 'object' && res.resource) {
          // Objects with resource/transform/actions - keep as is
          map[normalizeResourceName(res.resource)] = res;
        }
      }
      return map;
    }
    if (typeof resources === 'object') {
      const map = {};
      for (const [src, dest] of Object.entries(resources)) {
        const normSrc = normalizeResourceName(src);
        if (typeof dest === 'string') map[normSrc] = dest;
        else if (Array.isArray(dest)) {
          // Array of multiple destinations - support multi-destination replication
          map[normSrc] = dest.map(item => {
            if (typeof item === 'string') return item;
            if (typeof item === 'object' && item.resource) {
              // Keep object items as is
              return item;
            }
            return item;
          });
        } else if (typeof dest === 'function') map[normSrc] = dest;
        else if (typeof dest === 'object' && dest.resource) {
          // Support { resource, transform/transformer } format - keep as is
          map[normSrc] = dest;
        }
      }
      return map;
    }
    if (typeof resources === 'function') {
      return resources;
    }
    return {};
  }

  validateConfig() {
    const errors = [];
    // Accept both arrays and objects for resources
    if (!this.client && !this.connectionString) {
      errors.push('You must provide a client or a connectionString');
    }
    if (!this.resourcesMap || (typeof this.resourcesMap === 'object' && Object.keys(this.resourcesMap).length === 0)) {
      errors.push('You must provide a resources map or array');
    }
    return { isValid: errors.length === 0, errors };
  }

  async initialize(database) {
    await super.initialize(database);
    
    const [ok, err] = await tryFn(async () => {
      if (this.client) {
        this.targetDatabase = this.client;
      } else if (this.connectionString) {
        const targetConfig = {
          connectionString: this.connectionString,
          region: this.region,
          keyPrefix: this.keyPrefix,
          verbose: this.config.verbose || false
        };
        this.targetDatabase = new S3db(targetConfig);
        await this.targetDatabase.connect();
      } else {
        throw new Error('S3dbReplicator: No client or connectionString provided');
      }
      
      this.emit('connected', { 
        replicator: this.name, 
        target: this.connectionString || 'client-provided'
      });
    });
    
    if (!ok) {
      if (this.config.verbose) {
        console.warn(`[S3dbReplicator] Initialization failed: ${err.message}`);
      }
      throw err;
    }
  }

  // Support both object and parameter signatures for flexibility
  async replicate(resourceOrObj, operation, data, recordId, beforeData) {
    let resource, op, payload, id;
    
    // Handle object signature: { resource, operation, data, id }
    if (typeof resourceOrObj === 'object' && resourceOrObj.resource) {
      resource = resourceOrObj.resource;
      op = resourceOrObj.operation;
      payload = resourceOrObj.data;
      id = resourceOrObj.id;
    } else {
      // Handle parameter signature: (resource, operation, data, recordId, beforeData)
      resource = resourceOrObj;
      op = operation;
      payload = data;
      id = recordId;
    }
    
    const normResource = normalizeResourceName(resource);
    const entry = this.resourcesMap[normResource];
    
    if (!entry) {
      throw new Error(`[S3dbReplicator] Resource not configured: ${resource}`);
    }

    // Handle multi-destination arrays
    if (Array.isArray(entry)) {
      const results = [];
      for (const destConfig of entry) {
        const [ok, error, result] = await tryFn(async () => {
          return await this._replicateToSingleDestination(destConfig, normResource, op, payload, id);
        });
        
        if (!ok) {
          if (this.config && this.config.verbose) {
            console.warn(`[S3dbReplicator] Failed to replicate to destination ${JSON.stringify(destConfig)}: ${error.message}`);
          }
          throw error;
        }
        results.push(result);
      }
      return results;
    } else {
      // Single destination
      const [ok, error, result] = await tryFn(async () => {
        return await this._replicateToSingleDestination(entry, normResource, op, payload, id);
      });
      
      if (!ok) {
        if (this.config && this.config.verbose) {
          console.warn(`[S3dbReplicator] Failed to replicate to destination ${JSON.stringify(entry)}: ${error.message}`);
        }
        throw error;
      }
      return result;
    }
  }

  async _replicateToSingleDestination(destConfig, sourceResource, operation, data, recordId) {
    // Determine destination resource name
    let destResourceName;
    if (typeof destConfig === 'string') {
      destResourceName = destConfig;
    } else if (typeof destConfig === 'object' && destConfig.resource) {
      destResourceName = destConfig.resource;
    } else {
      destResourceName = sourceResource;
    }

    // Check if this destination supports the operation
    if (typeof destConfig === 'object' && destConfig.actions && Array.isArray(destConfig.actions)) {
      if (!destConfig.actions.includes(operation)) {
        return { skipped: true, reason: 'action_not_supported', action: operation, destination: destResourceName };
      }
    }

    const destResourceObj = this._getDestResourceObj(destResourceName);
    
    // Apply appropriate transformer for this destination
    let transformedData;
    if (typeof destConfig === 'object' && destConfig.transform && typeof destConfig.transform === 'function') {
      transformedData = destConfig.transform(data);
      // Ensure ID is preserved
      if (transformedData && data && data.id && !transformedData.id) {
        transformedData.id = data.id;
      }
    } else if (typeof destConfig === 'object' && destConfig.transformer && typeof destConfig.transformer === 'function') {
      transformedData = destConfig.transformer(data);
      // Ensure ID is preserved
      if (transformedData && data && data.id && !transformedData.id) {
        transformedData.id = data.id;
      }
    } else {
      transformedData = data;
    }

    // Fallback: if transformer returns undefined/null, use original data
    if (!transformedData && data) transformedData = data;

    let result;
    if (operation === 'insert') {
      result = await destResourceObj.insert(transformedData);
    } else if (operation === 'update') {
      result = await destResourceObj.update(recordId, transformedData);
    } else if (operation === 'delete') {
      result = await destResourceObj.delete(recordId);
    } else {
      throw new Error(`Invalid operation: ${operation}. Supported operations are: insert, update, delete`);
    }
    
    return result;
  }

  _applyTransformer(resource, data) {
    const normResource = normalizeResourceName(resource);
    const entry = this.resourcesMap[normResource];
    let result;
    if (!entry) return data;
    
    // Array of multiple destinations - use first transform found
    if (Array.isArray(entry)) {
      for (const item of entry) {
        if (typeof item === 'object' && item.transform && typeof item.transform === 'function') {
          result = item.transform(data);
          break;
        } else if (typeof item === 'object' && item.transformer && typeof item.transformer === 'function') {
          result = item.transformer(data);
          break;
        }
      }
      if (!result) result = data;
    } else if (typeof entry === 'object') {
      // Prefer transform, fallback to transformer for backwards compatibility
      if (typeof entry.transform === 'function') {
        result = entry.transform(data);
      } else if (typeof entry.transformer === 'function') {
        result = entry.transformer(data);
      }
    } else if (typeof entry === 'function') {
      // Function directly as transformer
      result = entry(data);
    } else {
      result = data;
    }
    
    // Ensure that id is always present
    if (result && data && data.id && !result.id) result.id = data.id;
    // Fallback: if transformer returns undefined/null, use original data
    if (!result && data) result = data;
    return result;
  }

  _resolveDestResource(resource, data) {
    const normResource = normalizeResourceName(resource);
    const entry = this.resourcesMap[normResource];
    if (!entry) return resource;
    
    // Array of multiple destinations - use first resource found
    if (Array.isArray(entry)) {
      for (const item of entry) {
        if (typeof item === 'string') return item;
        if (typeof item === 'object' && item.resource) return item.resource;
      }
      return resource; // fallback
    }
    // String mapping
    if (typeof entry === 'string') return entry;
    // Mapping function - when there's only transformer, use original resource
    if (typeof entry === 'function') return resource;
    // Object: { resource, transform }
    if (typeof entry === 'object' && entry.resource) return entry.resource;
    return resource;
  }

  _getDestResourceObj(resource) {
    const available = Object.keys(this.client.resources || {});
    const norm = normalizeResourceName(resource);
    const found = available.find(r => normalizeResourceName(r) === norm);
    if (!found) {
      throw new Error(`[S3dbReplicator] Destination resource not found: ${resource}. Available: ${available.join(', ')}`);
    }
    return this.client.resources[found];
  }

  async replicateBatch(resourceName, records) {
    if (!this.enabled || !this.shouldReplicateResource(resourceName)) {
      return { skipped: true, reason: 'resource_not_included' };
    }

    const results = [];
    const errors = [];

    for (const record of records) {
      const [ok, err, result] = await tryFn(() => this.replicate({
        resource: resourceName, 
        operation: record.operation, 
        id: record.id, 
        data: record.data, 
        beforeData: record.beforeData
      }));
      if (ok) {
        results.push(result);
      } else {
        if (this.config.verbose) {
          console.warn(`[S3dbReplicator] Batch replication failed for record ${record.id}: ${err.message}`);
        }
        errors.push({ id: record.id, error: err.message });
      }
    }

    this.emit('batch_replicated', {
      replicator: this.name,
      resourceName,
      total: records.length,
      successful: results.length,
      errors: errors.length
    });

    return { 
      success: errors.length === 0,
      results,
      errors,
      total: records.length
    };
  }

  async testConnection() {
    const [ok, err] = await tryFn(async () => {
      if (!this.targetDatabase) throw new Error('No target database configured');
      
      // Try to list resources to test connection
      if (typeof this.targetDatabase.connect === 'function') {
        await this.targetDatabase.connect();
      }
      
      return true;
    });
    
    if (!ok) {
      if (this.config.verbose) {
        console.warn(`[S3dbReplicator] Connection test failed: ${err.message}`);
      }
      this.emit('connection_error', { replicator: this.name, error: err.message });
      return false;
    }
    
    return true;
  }

  async getStatus() {
    const baseStatus = await super.getStatus();
    return {
      ...baseStatus,
      connected: !!this.targetDatabase,
      targetDatabase: this.connectionString || 'client-provided',
      resources: Object.keys(this.resourcesMap || {}),
      totalreplicators: this.listenerCount('replicated'),
      totalErrors: this.listenerCount('replicator_error')
    };
  }

  async cleanup() {
    if (this.targetDatabase) {
      // Close target database connection
      this.targetDatabase.removeAllListeners();
    }
    await super.cleanup();
  }

  shouldReplicateResource(resource, action) {
    const normResource = normalizeResourceName(resource);
    const entry = this.resourcesMap[normResource];
    if (!entry) return false;
    
    // If no action is specified, just check if resource is configured
    if (!action) return true;
    
    // Array of multiple destinations - check if any supports the action
    if (Array.isArray(entry)) {
      for (const item of entry) {
        if (typeof item === 'object' && item.resource) {
          if (item.actions && Array.isArray(item.actions)) {
            if (item.actions.includes(action)) return true;
          } else {
            return true; // If no actions specified, accept all
          }
        } else if (typeof item === 'string') {
          return true; // String destinations accept all actions
        }
      }
      return false;
    }
    
    if (typeof entry === 'object' && entry.resource) {
      if (entry.actions && Array.isArray(entry.actions)) {
        return entry.actions.includes(action);
      }
      return true;
    }
    if (typeof entry === 'string' || typeof entry === 'function') {
      return true;
    }
    return false;
  }
}

export default S3dbReplicator; 