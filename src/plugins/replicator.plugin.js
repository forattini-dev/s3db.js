import { isPlainObject } from 'lodash-es';

import Plugin from "./plugin.class.js";
import tryFn from "../concerns/try-fn.js";
import { createReplicator, validateReplicatorConfig } from "./replicators/index.js";

function normalizeResourceName(name) {
  return typeof name === 'string' ? name.trim().toLowerCase() : name;
}

/**
 * ReplicatorPlugin - S3DB replicator System
 *
 * This plugin enables flexible, robust replicator between S3DB databases and other systems.
 * 
 * === Plugin-Level Configuration Options ===
 *
 * - persistReplicatorLog (boolean, default: false)
 *     If true, the plugin will persist all replicator events to a log resource.
 *     If false, no replicator log resource is created or used.
 *
 * - replicatorLogResource (string, default: 'replicator_logs')
 *     The name of the resource used to store replicator logs.
 *
 * === replicator Log Resource Structure ===
 *
 * If persistReplicatorLog is true, the following resource is created (if not present):
 *
 *   name: <replicatorLogResource>
 *   behavior: 'truncate-data'
 *   attributes:
 *     - id: string|required
 *     - resource: string|required
 *     - action: string|required
 *     - data: object
 *     - timestamp: number|required
 *     - createdAt: string|required
 *   partitions:
 *     byDate: { fields: { createdAt: 'string|maxlength:10' } }
 *
 * This enables efficient log truncation and partitioned queries by date.
 *
 * === Replicator Configuration Syntax ===
 *
 * Each replicator entry supports the following options:
 *
 *   - driver: 's3db' | 'sqs' | ...
 *   - client: (optional) destination database/client instance
 *   - config: {
 *       connectionString?: string,
 *       resources?: <see below>,
 *       ...driver-specific options
 *     }
 *   - resources: <see below> (can be at top-level or inside config)
 *
 * === Supported Resource Mapping Syntaxes ===
 *
 * You can specify which resources to replicate and how, using any of:
 *
 *   1. Array of resource names (replicate to itself):
 *        resources: ['users']
 *
 *   2. Map: source resource → destination resource name:
 *        resources: { users: 'people' }
 *
 *   3. Map: source resource → [destination, transformer]:
 *        resources: { users: ['people', (el) => ({ ...el, fullName: el.name })] }
 *
 *   4. Map: source resource → { resource, transformer }:
 *        resources: { users: { resource: 'people', transformer: fn } }
 *
 *   5. Map: source resource → array of objects (multi-destination):
 *        resources: { users: [ { resource: 'people', transformer: fn } ] }
 *
 *   6. Map: source resource → function (transformer only):
 *        resources: { users: (el) => ({ ...el, fullName: el.name }) }
 *
 * All forms can be mixed and matched. The transformer is always available (default: identity function).
 *
 * === Example Plugin Configurations ===
 *
 *   // Basic replicator to another database
 *   new ReplicatorPlugin({
 *     replicators: [
 *       { driver: 's3db', client: dbB, resources: ['users'] }
 *     ]
 *   });
 *
 *   // Replicate with custom log resource and persistence
 *   new ReplicatorPlugin({
 *     persistReplicatorLog: true,
 *     replicatorLogResource: 'custom_logs',
 *     replicators: [
 *       { driver: 's3db', client: dbB, config: { resources: { users: 'people' } } }
 *     ]
 *   });
 *
 *   // Advanced mapping with transformer
 *   new ReplicatorPlugin({
 *     replicators: [
 *       { driver: 's3db', client: dbB, config: { resources: { users: ['people', (el) => ({ ...el, fullName: el.name })] } } }
 *     ]
 *   });
 *
 *   // replicator using a connection string
 *   new ReplicatorPlugin({
 *     replicators: [
 *       { driver: 's3db', config: { connectionString: 's3://user:pass@bucket/path', resources: ['users'] } }
 *     ]
 *   });
 * 
 * === Default Behaviors and Extensibility ===
 *
 * - If persistReplicatorLog is not set, no log resource is created.
 * - The log resource is only created if it does not already exist.
 * - The plugin supports multiple replicators and drivers.
 * - All resource mapping syntaxes are supported and can be mixed.
 * - The log resource uses the 'truncate-data' behavior for efficient log management.
 * - Partitioning by date enables efficient queries and retention policies.
 *
 * === See also ===
 * - S3dbReplicator for advanced resource mapping logic
 * - SqsReplicator for SQS integration
 * - ReplicatorPlugin tests for usage examples
 */
export class ReplicatorPlugin extends Plugin {
  constructor(options = {}) {
    super();
    // Validation for config tests
    if (!options.replicators || !Array.isArray(options.replicators)) {
      throw new Error('ReplicatorPlugin: replicators array is required');
    }
    for (const rep of options.replicators) {
      if (!rep.driver) throw new Error('ReplicatorPlugin: each replicator must have a driver');
      if (!rep.resources || typeof rep.resources !== 'object') throw new Error('ReplicatorPlugin: each replicator must have resources config');
      if (Object.keys(rep.resources).length === 0) throw new Error('ReplicatorPlugin: each replicator must have at least one resource configured');
    }
    
    this.config = {
      replicators: options.replicators || [],
      logErrors: options.logErrors !== false,
      replicatorLogResource: options.replicatorLogResource || 'replicator_log',
      enabled: options.enabled !== false,
      batchSize: options.batchSize || 100,
      maxRetries: options.maxRetries || 3,
      timeout: options.timeout || 30000,
      verbose: options.verbose || false,
      ...options
    };
    
    this.replicators = [];
    this.database = null;
    this.eventListenersInstalled = new Set();
  }

  /**
   * Decompress data if it was compressed
   */
  async decompressData(data) {
    return data;
  }

  // Helper to filter out internal S3DB fields
  filterInternalFields(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    const filtered = {};
    for (const [key, value] of Object.entries(obj)) {
      if (!key.startsWith('_') && key !== '$overflow' && key !== '$before' && key !== '$after') {
        filtered[key] = value;
      }
    }
    return filtered;
  }

  installEventListeners(resource, database, plugin) {
    if (!resource || this.eventListenersInstalled.has(resource.name) || 
        resource.name === this.config.replicatorLogResource) {
      return;
    }

    resource.on('insert', async (data) => {
      try {
        const completeData = { ...data, createdAt: new Date().toISOString() };
        await plugin.processReplicatorEvent('insert', resource.name, completeData.id, completeData);
      } catch (error) {
        this.emit('error', { operation: 'insert', error: error.message, resource: resource.name });
      }
    });

    resource.on('update', async (data, beforeData) => {
      try {
        const completeData = { ...data, updatedAt: new Date().toISOString() };
        await plugin.processReplicatorEvent('update', resource.name, completeData.id, completeData, beforeData);
      } catch (error) {
        this.emit('error', { operation: 'update', error: error.message, resource: resource.name });
      }
    });

    resource.on('delete', async (data) => {
      try {
        await plugin.processReplicatorEvent('delete', resource.name, data.id, data);
      } catch (error) {
        this.emit('error', { operation: 'delete', error: error.message, resource: resource.name });
      }
    });

    this.eventListenersInstalled.add(resource.name);
  }

  /**
   * Get complete data by always fetching the full record from the resource
   * This ensures we always have the complete data regardless of behavior or data size
   */
  async getCompleteData(resource, data) {
    // Always get the complete record from the resource to ensure we have all data
    // This handles all behaviors: body-overflow, truncate-data, body-only, etc.
    const [ok, err, completeRecord] = await tryFn(() => resource.get(data.id));
    return ok ? completeRecord : data;
  }

  async setup(database) {
    this.database = database;

    try {
      await this.initializeReplicators(database);
    } catch (error) {
      this.emit('error', { operation: 'setup', error: error.message });
      throw error;
    }

    try {
      if (this.config.replicatorLogResource) {
        const logRes = await database.createResource({
          name: this.config.replicatorLogResource,
          behavior: 'body-overflow',
          attributes: {
            operation: 'string',
            resourceName: 'string', 
            recordId: 'string',
            data: 'string',
            error: 'string|optional',
            replicator: 'string',
            timestamp: 'string',
            status: 'string'
          }
        });
      }
    } catch (error) {
      // Log resource creation failed, continue without it
    }

    await this.uploadMetadataFile(database);

    const originalCreateResource = database.createResource.bind(database);
    database.createResource = async (config) => {
      const resource = await originalCreateResource(config);
      if (resource) {
        this.installEventListeners(resource, database, this);
      }
      return resource;
    };

    for (const resourceName in database.resources) {
      const resource = database.resources[resourceName];
      this.installEventListeners(resource, database, this);
    }
  }

  createReplicator(driver, config, resources, client) {
    return createReplicator(driver, config, resources, client);
  }

  async initializeReplicators(database) {
    for (const replicatorConfig of this.config.replicators) {
      const { driver, config = {}, resources, client, ...otherConfig } = replicatorConfig;
      
      // Extract resources from replicatorConfig or config
      const replicatorResources = resources || config.resources || {};
      
      // Merge config with other top-level config options (like queueUrlDefault)
      const mergedConfig = { ...config, ...otherConfig };
      
      // Pass config, resources, and client in correct order
      const replicator = this.createReplicator(driver, mergedConfig, replicatorResources, client);
      if (replicator) {
        await replicator.initialize(database);
        this.replicators.push(replicator);
      }
    }
  }

  async start() {
    // Plugin is ready
  }

  async stop() {
    // Stop queue processing
    // this.isProcessing = false; // Removed as per edit hint
    // Process remaining queue items
    // await this.processQueue(); // Removed as per edit hint
  }

  filterInternalFields(data) {
    if (!data || typeof data !== 'object') return data;
    const filtered = {};
    for (const [key, value] of Object.entries(data)) {
      // Filter out internal fields that start with _ or $
      if (!key.startsWith('_') && !key.startsWith('$')) {
        filtered[key] = value;
      }
    }
    return filtered;
  }

  async uploadMetadataFile(database) {
    if (typeof database.uploadMetadataFile === 'function') {
      await database.uploadMetadataFile();
    }
  }

  async getCompleteData(resource, data) {
    try {
      const [ok, err, record] = await tryFn(() => resource.get(data.id));
      if (ok && record) {
        return record;
      }
    } catch (error) {
      // Fallback to provided data
    }
    return data;
  }

  async retryWithBackoff(operation, maxRetries = 3) {
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (attempt === maxRetries) {
          throw error;
        }
        // Simple backoff: wait 1s, 2s, 4s...
        const delay = Math.pow(2, attempt - 1) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw lastError;
  }

  async logError(replicator, resourceName, operation, recordId, data, error) {
    try {
      const logResourceName = this.config.replicatorLogResource;
      if (this.database && this.database.resources && this.database.resources[logResourceName]) {
        const logResource = this.database.resources[logResourceName];
        await logResource.insert({
          replicator: replicator.name || replicator.id,
          resourceName,
          operation,
          recordId,
          data: JSON.stringify(data),
          error: error.message,
          timestamp: new Date().toISOString(),
          status: 'error'
        });
      }
    } catch (logError) {
      // Silent log errors
    }
  }

  async processReplicatorEvent(operation, resourceName, recordId, data, beforeData = null) {
    if (!this.config.enabled) return;

    const applicableReplicators = this.replicators.filter(replicator => {
      const should = replicator.shouldReplicateResource && replicator.shouldReplicateResource(resourceName, operation);
      return should;
    });

    if (applicableReplicators.length === 0) {
      return;
    }

    const promises = applicableReplicators.map(async (replicator) => {
      try {
        const result = await this.retryWithBackoff(
          () => replicator.replicate(resourceName, operation, data, recordId, beforeData),
          this.config.maxRetries
        );
        
        this.emit('replicated', {
          replicator: replicator.name || replicator.id,
          resourceName,
          operation,
          recordId,
          result,
          success: true
        });

        return result;
      } catch (error) {
        this.emit('replicator_error', {
          replicator: replicator.name || replicator.id,
          resourceName,
          operation,
          recordId,
          error: error.message
        });

        if (this.config.logErrors && this.database) {
          await this.logError(replicator, resourceName, operation, recordId, data, error);
        }

        throw error;
      }
    });

    return Promise.allSettled(promises);
  }

  async processreplicatorItem(item) {
    const applicableReplicators = this.replicators.filter(replicator => {
      const should = replicator.shouldReplicateResource && replicator.shouldReplicateResource(item.resourceName, item.operation);
      return should;
    });

    if (applicableReplicators.length === 0) {
      return;
    }

    const promises = applicableReplicators.map(async (replicator) => {
      try {
        const [ok, err, result] = await tryFn(() => 
          replicator.replicate(item.resourceName, item.operation, item.data, item.recordId, item.beforeData)
        );

        if (!ok) {
          this.emit('replicator_error', {
            replicator: replicator.name || replicator.id,
            resourceName: item.resourceName,
            operation: item.operation,
            recordId: item.recordId,
            error: err.message
          });

          if (this.config.logErrors && this.database) {
            await this.logError(replicator, item.resourceName, item.operation, item.recordId, item.data, err);
          }

          return { success: false, error: err.message };
        }

        this.emit('replicated', {
          replicator: replicator.name || replicator.id,
          resourceName: item.resourceName,
          operation: item.operation,
          recordId: item.recordId,
          result,
          success: true
        });

        return { success: true, result };
      } catch (error) {
        this.emit('replicator_error', {
          replicator: replicator.name || replicator.id,
          resourceName: item.resourceName,
          operation: item.operation,
          recordId: item.recordId,
          error: error.message
        });

        if (this.config.logErrors && this.database) {
          await this.logError(replicator, item.resourceName, item.operation, item.recordId, item.data, error);
        }

        return { success: false, error: error.message };
      }
    });

    return Promise.allSettled(promises);
  }

  async logreplicator(item) {
            // Always use the saved reference
    const logRes = this.replicatorLog || this.database.resources[normalizeResourceName(this.config.replicatorLogResource)];
    if (!logRes) {
      if (this.database) {
        if (this.database.options && this.database.options.connectionString) {
        }
      }
      this.emit('replicator.log.failed', { error: 'replicator log resource not found', item });
      return;
    }
            // Fix required fields of log resource
    const logItem = {
      id: item.id || `repl-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      resource: item.resource || item.resourceName || '',
      action: item.operation || item.action || '',
      data: item.data || {},
      timestamp: typeof item.timestamp === 'number' ? item.timestamp : Date.now(),
      createdAt: item.createdAt || new Date().toISOString().slice(0, 10),
    };
    try {
      await logRes.insert(logItem);
    } catch (err) {
      this.emit('replicator.log.failed', { error: err, item });
    }
  }

  async updatereplicatorLog(logId, updates) {
    if (!this.replicatorLog) return;

    const [ok, err] = await tryFn(async () => {
      await this.replicatorLog.update(logId, {
        ...updates,
        lastAttempt: new Date().toISOString()
      });
    });
    if (!ok) {
      this.emit('replicator.updateLog.failed', { error: err.message, logId, updates });
    }
  }

  // Utility methods
  async getreplicatorStats() {
    const replicatorStats = await Promise.all(
      this.replicators.map(async (replicator) => {
        const status = await replicator.getStatus();
        return {
          id: replicator.id,
          driver: replicator.driver,
          config: replicator.config,
          status
        };
      })
    );

    return {
      replicators: replicatorStats,
      queue: {
        length: this.queue.length,
        isProcessing: this.isProcessing
      },
      stats: this.stats,
      lastSync: this.stats.lastSync
    };
  }

  async getreplicatorLogs(options = {}) {
    if (!this.replicatorLog) {
      return [];
    }

    const {
      resourceName,
      operation,
      status,
      limit = 100,
      offset = 0
    } = options;

    let query = {};
    
    if (resourceName) {
      query.resourceName = resourceName;
    }
    
    if (operation) {
      query.operation = operation;
    }
    
    if (status) {
      query.status = status;
    }

    const logs = await this.replicatorLog.list(query);
    
    // Apply pagination
    return logs.slice(offset, offset + limit);
  }

  async retryFailedreplicators() {
    if (!this.replicatorLog) {
      return { retried: 0 };
    }

    const failedLogs = await this.replicatorLog.list({
      status: 'failed'
    });

    let retried = 0;
    
    for (const log of failedLogs) {
      const [ok, err] = await tryFn(async () => {
        // Re-queue the replicator
        await this.processReplicatorEvent(
          log.resourceName,
          log.operation,
          log.recordId,
          log.data
        );
      });
      if (ok) {
        retried++;
      } else {
        // Retry failed, continue
      }
    }

    return { retried };
  }

  async syncAllData(replicatorId) {
    const replicator = this.replicators.find(r => r.id === replicatorId);
    if (!replicator) {
      throw new Error(`Replicator not found: ${replicatorId}`);
    }

    this.stats.lastSync = new Date().toISOString();

    for (const resourceName in this.database.resources) {
      if (normalizeResourceName(resourceName) === normalizeResourceName('replicator_logs')) continue;

      if (replicator.shouldReplicateResource(resourceName)) {
        this.emit('replicator.sync.resource', { resourceName, replicatorId });
        
        const resource = this.database.resources[resourceName];
      const allRecords = await resource.getAll();
      
      for (const record of allRecords) {
          await replicator.replicate(resourceName, 'insert', record, record.id);
        }
      }
    }

    this.emit('replicator.sync.completed', { replicatorId, stats: this.stats });
  }

  async cleanup() {
    try {
      if (this.replicators && this.replicators.length > 0) {
        const cleanupPromises = this.replicators.map(async (replicator) => {
          try {
            if (replicator && typeof replicator.cleanup === 'function') {
              await replicator.cleanup();
            }
          } catch (error) {
            // Silent cleanup errors
          }
        });
        
        await Promise.allSettled(cleanupPromises);
      }
      
      this.replicators = [];
      this.database = null;
      this.eventListenersInstalled.clear();
      
      this.removeAllListeners();
    } catch (error) {
      // Silent cleanup errors
    }
  }
}

export default ReplicatorPlugin; 