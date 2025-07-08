import Plugin from "./plugin.class.js";
import { createReplicator, validateReplicatorConfig } from "../replicators/index.js";
import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';
import { isPlainObject } from 'lodash-es';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

/**
 * ReplicationPlugin - Replicates data to multiple targets using driver-based replicators
 * 
 * Available Events:
 * - replication.queued: Emitted when a replication item is queued
 * - replication.success: Emitted when replication succeeds
 * - replication.failed: Emitted when replication fails after all retries
 * - replication.retry.exhausted: Emitted when retry attempts are exhausted
 * - replication.retry.started: Emitted when retrying failed replications
 * - replication.sync.resource: Emitted when syncing a specific resource
 * - replication.sync.completed: Emitted when full sync is completed
 * - replication.compression.failed: Emitted when compression fails
 * - replication.decompression.failed: Emitted when decompression fails
 * - replication.log.failed: Emitted when logging replication fails
 * - replication.updateLog.failed: Emitted when updating replication log fails
 * 
 * Example usage:
 * ```javascript
 * const plugin = new ReplicationPlugin({
 *   enabled: true,
 *   replicators: [
 *     {
 *       driver: 's3db',
 *       config: {
 *         connectionString: 's3://...',
 *         resources: ['users', 'products']
 *       }
 *     },
 *     {
 *       driver: 'sqs',
 *       config: {
 *         queueUrl: 'https://sqs...',
 *         resources: ['orders']
 *       }
 *     }
 *   ]
 * });
 * 
 * plugin.on('replication.failed', (data) => {
 *   console.error('Replication failed:', data.lastError);
 * });
 * 
 * plugin.on('replication.success', (data) => {
 *   console.log('Replication succeeded after', data.attempts, 'attempts');
 * });
 * ```
 */
export class ReplicationPlugin extends Plugin {
  constructor(options = {}) {
    super();
    this.config = {
      enabled: options.enabled !== false,
      replicators: options.replicators || [],
      syncMode: options.syncMode || 'async', // 'sync' or 'async'
      retryAttempts: options.retryAttempts || 3,
      retryDelay: options.retryDelay || 1000, // ms
      batchSize: options.batchSize || 10,
      compression: options.compression || false, // Enable compression
      compressionLevel: options.compressionLevel || 6, // 0-9
      ...options
    };
    this.replicators = [];
    this.queue = [];
    this.isProcessing = false;
    this.stats = {
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      lastSync: null
    };
  }

  /**
   * Process data according to replication mode
   */
  processDataForReplication(data, metadata = {}) {
    switch (this.config.replicationMode) {
      case 'exact-copy':
        return {
          body: data,
          metadata: metadata
        };
      
      case 'just-metadata':
        return {
          body: null,
          metadata: metadata
        };
      
      case 'all-in-body':
        return {
          body: {
            data: data,
            metadata: metadata,
            replicationMode: this.config.replicationMode,
            timestamp: new Date().toISOString()
          },
          metadata: {
            replicationMode: this.config.replicationMode,
            timestamp: new Date().toISOString()
          }
        };
      
      default:
        return {
          body: data,
          metadata: metadata
        };
    }
  }

  /**
   * Compress data if compression is enabled
   */
  async compressData(data) {
    if (!this.config.compression || !data) {
      return data;
    }

    try {
      const jsonString = JSON.stringify(data);
      const compressed = await gzipAsync(jsonString, { level: this.config.compressionLevel });
      return compressed.toString('base64');
    } catch (error) {
      this.emit('replication.compression.failed', { error, data });
      return data; // Return original data if compression fails
    }
  }

  /**
   * Decompress data if it was compressed
   */
  async decompressData(data) {
    if (!this.config.compression || !data) {
      return data;
    }

    try {
      // Check if data is base64 encoded compressed data
      if (typeof data === 'string' && data.startsWith('H4sI')) {
        const buffer = Buffer.from(data, 'base64');
        const decompressed = await gunzipAsync(buffer);
        return JSON.parse(decompressed.toString());
      }
      return data;
    } catch (error) {
      this.emit('replication.decompression.failed', { error, data });
      return data; // Return original data if decompression fails
    }
  }

  async setup(database) {
    this.database = database;

    // Only create resources and install hooks if plugin is enabled
    if (!this.config.enabled) {
      return;
    }

    // Initialize replicators if any are configured
    if (this.config.replicators && this.config.replicators.length > 0) {
      await this.initializeReplicators();
    }

    // Create replication log resource only if it doesn't exist
    if (!database.resources.replication_logs) {
      this.replicationLog = await database.createResource({
        name: 'replication_logs',
        attributes: {
          id: 'string|required',
          resourceName: 'string|required',
          operation: 'string|required',
          recordId: 'string|required',
          replicatorId: 'string|required',
          status: 'string|required',
          attempts: 'number|required',
          lastAttempt: 'string|required',
          error: 'string|required',
          data: 'object|required',
          timestamp: 'string|required'
        }
      });
    } else {
      this.replicationLog = database.resources.replication_logs;
    }

    // Install hooks on existing resources
    for (const resourceName in database.resources) {
      if (resourceName !== 'replication_logs') {
        this.installHooks(database.resources[resourceName]);
      }
    }

    // Hook into database to install hooks on new resources
    const originalCreateResource = database.createResource.bind(database);
    database.createResource = async (config) => {
      const resource = await originalCreateResource(config);
      if (resource && resource.name !== 'replication_logs') {
        this.installHooks(resource);
      }
      return resource;
    };

    // Start queue processing
    this.startQueueProcessor();
  }

  async initializeReplicators() {
    for (const replicatorConfig of this.config.replicators) {
      try {
        const { driver, config: replicatorConfigData, resources = [] } = replicatorConfig;
        // Validate replicator configuration
        const validation = validateReplicatorConfig(driver, replicatorConfigData, resources);
        if (!validation.isValid) {
          this.emit('replicator.validation.failed', {
            driver,
            errors: validation.errors
          });
          continue;
        }
        // Create and initialize replicator
        const replicator = createReplicator(driver, replicatorConfigData, resources);
        await replicator.initialize(this.database);
        // Listen to replicator events
        replicator.on('replicated', (data) => {
          this.emit('replication.success', data);
        });
        replicator.on('replication_error', (data) => {
          this.emit('replication.failed', data);
        });
        this.replicators.push({
          id: `${driver}-${Date.now()}`,
          driver,
          config: replicatorConfigData,
          resources,
          instance: replicator
        });
        this.emit('replicator.initialized', {
          driver,
          config: replicatorConfigData,
          resources
        });
      } catch (error) {
        this.emit('replicator.initialization.failed', {
          driver: replicatorConfig.driver,
          error: error.message
        });
      }
    }
  }

  async start() {
    // Plugin is ready
  }

  async stop() {
    // Stop queue processing
    this.isProcessing = false;
    // Process remaining queue items
    await this.processQueue();
  }

  installHooks(resource) {
    if (!resource || resource.name === 'replication_logs') return;

    // Store original data for update operations
    const originalDataMap = new Map();

    // Use native hooks instead of monkey patching
    resource.addHook('afterInsert', async (data) => {
      await this.queueReplication(resource.name, 'insert', data.id, data);
      return data;
    });

    resource.addHook('preUpdate', async (data) => {
      // Store original data before update
      if (data.id) {
        try {
          const originalData = await resource.get(data.id);
          originalDataMap.set(data.id, originalData);
        } catch (error) {
          // If get fails, use minimal data
          originalDataMap.set(data.id, { id: data.id });
        }
      }
      return data;
    });

    resource.addHook('afterUpdate', async (data) => {
      const beforeData = originalDataMap.get(data.id);
      await this.queueReplication(resource.name, 'update', data.id, data, beforeData);
      originalDataMap.delete(data.id); // Clean up
      return data;
    });

    resource.addHook('afterDelete', async (data) => {
      await this.queueReplication(resource.name, 'delete', data.id, data);
      return data;
    });

    // For deleteMany, we need to handle it differently since it doesn't have a native hook
    // We'll keep the monkey patching only for deleteMany
    const originalDeleteMany = resource.deleteMany.bind(resource);
    resource.deleteMany = async (ids) => {
      const result = await originalDeleteMany(ids);
      if (result && result.length > 0) {
        for (const id of ids) {
          await this.queueReplication(resource.name, 'delete', id, { id });
        }
      }
      return result;
    };
  }

  async queueReplication(resourceName, operation, recordId, data, beforeData = null) {
    if (!this.config.enabled) {
      return;
    }

    // If no replicators, just return (for testing purposes)
    if (this.replicators.length === 0) {
      return;
    }

    // Check if any replicator should handle this resource
    const applicableReplicators = this.replicators.filter(replicator => 
      replicator.instance.shouldReplicateResource(resourceName)
    );

    if (applicableReplicators.length === 0) {
      return;
    }

    const item = {
      id: `repl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      resourceName,
      operation,
      recordId,
      data: isPlainObject(data) ? data : { raw: data },
      beforeData: beforeData ? (isPlainObject(beforeData) ? beforeData : { raw: beforeData }) : null,
      timestamp: new Date().toISOString(),
      attempts: 0
    };

    // Log replication attempt
    const logId = await this.logReplication(item);

    if (this.config.syncMode === 'sync') {
      // Process immediately
      try {
        const result = await this.processReplicationItem(item);
        
        if (logId) {
          await this.updateReplicationLog(logId, {
            status: result.success ? 'success' : 'failed',
            attempts: 1,
            error: result.success ? '' : JSON.stringify(result.results)
          });
        }

        this.stats.totalOperations++;
        if (result.success) {
          this.stats.successfulOperations++;
        } else {
          this.stats.failedOperations++;
        }
      } catch (error) {
        if (logId) {
          await this.updateReplicationLog(logId, {
            status: 'failed',
            attempts: 1,
            error: error.message
          });
        }
        this.stats.failedOperations++;
      }
    } else {
      // Queue for async processing
      this.queue.push(item);
      this.emit('replication.queued', { item, queueLength: this.queue.length });
    }
  }

  async processReplicationItem(item) {
    const { resourceName, operation, recordId, data, beforeData } = item;
    
    // Find applicable replicators for this resource
    const applicableReplicators = this.replicators.filter(replicator => 
      replicator.instance.shouldReplicateResource(resourceName)
    );

    if (applicableReplicators.length === 0) {
      return { success: true, skipped: true, reason: 'no_applicable_replicators' };
    }

    const results = [];
    
    for (const replicator of applicableReplicators) {
      try {
        const result = await replicator.instance.replicate(resourceName, operation, data, recordId, beforeData);
        results.push({
          replicatorId: replicator.id,
          driver: replicator.driver,
          success: result.success,
          error: result.error,
          skipped: result.skipped
        });
      } catch (error) {
        results.push({
          replicatorId: replicator.id,
          driver: replicator.driver,
          success: false,
          error: error.message
        });
      }
    }

    return {
      success: results.every(r => r.success || r.skipped),
      results
    };
  }

  async logReplication(item) {
    if (!this.replicationLog) return;

    try {
      const logId = `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      await this.replicationLog.insert({
        id: logId,
        resourceName: item.resourceName,
        operation: item.operation,
        recordId: item.recordId,
        replicatorId: 'all', // Will be updated with specific replicator results
        status: 'queued',
        attempts: 0,
        lastAttempt: new Date().toISOString(),
        error: '',
        data: isPlainObject(item.data) ? item.data : { raw: item.data },
        timestamp: new Date().toISOString()
      });

      return logId;
    } catch (error) {
      this.emit('replication.log.failed', { error: error.message, item });
      return null;
    }
  }

  async updateReplicationLog(logId, updates) {
    if (!this.replicationLog) return;

    try {
      await this.replicationLog.update(logId, {
        ...updates,
        lastAttempt: new Date().toISOString()
      });
    } catch (error) {
      this.emit('replication.updateLog.failed', { error: error.message, logId, updates });
    }
  }

  startQueueProcessor() {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    this.processQueueLoop();
  }

  async processQueueLoop() {
    while (this.isProcessing) {
      if (this.queue.length > 0) {
        const batch = this.queue.splice(0, this.config.batchSize);
        
        for (const item of batch) {
          await this.processReplicationItem(item);
        }
      } else {
        // Wait a bit before checking again
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  async processQueue() {
    if (this.queue.length === 0) return;

    const item = this.queue.shift();
    let attempts = 0;
    let lastError = null;

    while (attempts < this.config.retryAttempts) {
      try {
        attempts++;
        
        this.emit('replication.retry.started', { 
          item, 
          attempt: attempts,
          maxAttempts: this.config.retryAttempts 
        });

        const result = await this.processReplicationItem(item);
        
        if (result.success) {
          this.stats.successfulOperations++;
          this.emit('replication.success', { 
            item, 
            attempts,
            results: result.results,
            stats: this.stats 
          });
          return;
        } else {
          lastError = result.results;
          
          if (attempts < this.config.retryAttempts) {
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, this.config.retryDelay * attempts));
          }
        }
      } catch (error) {
        lastError = error.message;
        
        if (attempts < this.config.retryAttempts) {
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, this.config.retryDelay * attempts));
        } else {
          this.emit('replication.retry.exhausted', { 
            attempts, 
            lastError, 
            item 
          });
      }
    }
    }

    this.stats.failedOperations++;
    this.emit('replication.failed', { 
      attempts, 
      lastError, 
      item,
      stats: this.stats 
    });
  }

  // Utility methods
  async getReplicationStats() {
    const replicatorStats = await Promise.all(
      this.replicators.map(async (replicator) => {
        const status = await replicator.instance.getStatus();
        return {
          id: replicator.id,
          driver: replicator.driver,
          config: replicator.config,
          status
        };
      })
    );

    return {
      enabled: this.config.enabled,
      replicators: replicatorStats,
      queue: {
        length: this.queue.length,
        isProcessing: this.isProcessing
      },
      stats: this.stats,
      lastSync: this.stats.lastSync
    };
  }

  async getReplicationLogs(options = {}) {
    if (!this.replicationLog) {
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

    const logs = await this.replicationLog.list(query);
    
    // Apply pagination
    return logs.slice(offset, offset + limit);
  }

  async retryFailedReplications() {
    if (!this.replicationLog) {
      return { retried: 0 };
    }

    const failedLogs = await this.replicationLog.list({
      status: 'failed'
    });

    let retried = 0;
    
    for (const log of failedLogs) {
      try {
        // Re-queue the replication
        await this.queueReplication(
          log.resourceName,
          log.operation,
          log.recordId,
          log.data
        );
        retried++;
      } catch (error) {
        console.error('Failed to retry replication:', error);
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
      if (resourceName === 'replication_logs') continue;

      if (replicator.instance.shouldReplicateResource(resourceName)) {
        this.emit('replication.sync.resource', { resourceName, replicatorId });
        
        const resource = this.database.resources[resourceName];
      const allRecords = await resource.getAll();
      
      for (const record of allRecords) {
          await replicator.instance.replicate(resourceName, 'insert', record, record.id);
        }
      }
    }

    this.emit('replication.sync.completed', { replicatorId, stats: this.stats });
  }
}

export default ReplicationPlugin; 