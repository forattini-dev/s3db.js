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
    // Suporta array, objeto, função, string
    if (!resources) return {};
    if (Array.isArray(resources)) {
      const map = {};
      for (const res of resources) {
        if (typeof res === 'string') map[normalizeResourceName(res)] = res;
        else if (Array.isArray(res) && typeof res[0] === 'string') map[normalizeResourceName(res[0])] = res;
        else if (typeof res === 'object' && res.resource) {
          // Array of objects with resource/action/transformer
          map[normalizeResourceName(res.resource)] = { ...res };
        }
        // Do NOT set actions: ['insert'] or any default actions here
      }
      return map;
    }
    if (typeof resources === 'object') {
      const map = {};
      for (const [src, dest] of Object.entries(resources)) {
        const normSrc = normalizeResourceName(src);
        if (typeof dest === 'string') map[normSrc] = dest;
        else if (Array.isArray(dest)) {
          // Array of destinations/objects/transformers
          map[normSrc] = dest.map(item => {
            if (typeof item === 'string') return item;
            if (typeof item === 'function') return item;
            if (typeof item === 'object' && item.resource) {
              // Copy all fields (resource, transformer, actions, etc.)
              return { ...item };
            }
            return item;
          });
        } else if (typeof dest === 'function') map[normSrc] = dest;
        else if (typeof dest === 'object' && dest.resource) {
          // Copy all fields (resource, transformer, actions, etc.)
          map[normSrc] = { ...dest };
        }
      }
      return map;
    }
    if (typeof resources === 'function') {
      return resources;
    }
    if (typeof resources === 'string') {
      const map = { [normalizeResourceName(resources)]: resources };
      return map;
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
    try {
    await super.initialize(database);
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
    } catch (err) {
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
    const destResource = this._resolveDestResource(normResource, payload);
    const destResourceObj = this._getDestResourceObj(destResource);
    
    // Apply transformer before replicating
    const transformedData = this._applyTransformer(normResource, payload);
    
    let result;
    if (op === 'insert') {
      result = await destResourceObj.insert(transformedData);
    } else if (op === 'update') {
      result = await destResourceObj.update(id, transformedData);
    } else if (op === 'delete') {
      result = await destResourceObj.delete(id);
    } else {
      throw new Error(`Invalid operation: ${op}. Supported operations are: insert, update, delete`);
    }
    
    return result;
  }

  _applyTransformer(resource, data) {
    const normResource = normalizeResourceName(resource);
    const entry = this.resourcesMap[normResource];
    let result;
    if (!entry) return data;
    // Array: [resource, transformer]
    if (Array.isArray(entry) && typeof entry[1] === 'function') {
      result = entry[1](data);
    } else if (typeof entry === 'function') {
      result = entry(data);
    } else if (typeof entry === 'object') {
      if (typeof entry.transform === 'function') result = entry.transform(data);
      else if (typeof entry.transformer === 'function') result = entry.transformer(data);
    } else {
      result = data;
    }
    // Garante que id sempre está presente
    if (result && data && data.id && !result.id) result.id = data.id;
    // Fallback: if transformer returns undefined/null, use original data
    if (!result && data) result = data;
    return result;
  }

  _resolveDestResource(resource, data) {
    const normResource = normalizeResourceName(resource);
    const entry = this.resourcesMap[normResource];
    if (!entry) return resource;
    // Array: [resource, transformer]
    if (Array.isArray(entry)) {
      if (typeof entry[0] === 'string') return entry[0];
      if (typeof entry[0] === 'object' && entry[0].resource) return entry[0].resource;
      if (typeof entry[0] === 'function') return resource; // fallback
    }
    // String mapping
    if (typeof entry === 'string') return entry;
    // Função mapping - quando só há transformer, usa o resource original
    if (typeof entry === 'function') return resource;
    // Objeto: { resource, transform }
    if (typeof entry === 'object' && entry.resource) return entry.resource;
    return resource;
  }

  _getDestResourceObj(resource) {
    if (!this.client || !this.client.resources) return null;
    const available = Object.keys(this.client.resources);
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
      if (ok) results.push(result);
      else errors.push({ id: record.id, error: err.message });
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
      if (!this.targetDatabase) {
        await this.initialize(this.database);
      }
      // Try to list resources to test connection
      await this.targetDatabase.listResources();
      return true;
    });
    if (ok) return true;
    this.emit('connection_error', {
      replicator: this.name,
      error: err.message
    });
    return false;
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
    
    // Suporte a todos os estilos de configuração
    // Se for array de objetos, checar actions
    if (Array.isArray(entry)) {
      for (const item of entry) {
        if (typeof item === 'object' && item.resource) {
          if (item.actions && Array.isArray(item.actions)) {
            if (item.actions.includes(action)) return true;
          } else {
            return true; // Se não há actions, aceita todas
          }
        } else if (typeof item === 'string' || typeof item === 'function') {
          return true;
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