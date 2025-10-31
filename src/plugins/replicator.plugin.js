import { Plugin } from "./plugin.class.js";
import tryFn from "../concerns/try-fn.js";
import { createReplicator, validateReplicatorConfig } from "./replicators/index.js";
import { ReplicationError } from "./replicator.errors.js";
import { resolveResourceName } from "./concerns/resource-names.js";

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
 * - replicatorLogResource (string, default: 'plg_replicator_logs')
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
 *   3. Map: source resource → { resource, transform }:
 *        resources: { users: { resource: 'people', transform: fn } }
 *
 *   4. Map: source resource → function (transformer only):
 *        resources: { users: (el) => ({ ...el, fullName: el.name }) }
 *
 * The transform function is optional and applies to data before replication.
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
 *   // Advanced mapping with transform
 *   new ReplicatorPlugin({
 *     replicators: [
 *       { driver: 's3db', client: dbB, config: { resources: { users: { resource: 'people', transform: (el) => ({ ...el, fullName: el.name }) } } } }
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
      throw new ReplicationError('ReplicatorPlugin requires replicators array', {
        operation: 'constructor',
        pluginName: 'ReplicatorPlugin',
        providedOptions: Object.keys(options),
        suggestion: 'Provide replicators array: new ReplicatorPlugin({ replicators: [{ driver: "s3db", resources: [...] }] })'
      });
    }
    for (const rep of options.replicators) {
      if (!rep.driver) {
        throw new ReplicationError('Each replicator must have a driver', {
          operation: 'constructor',
          pluginName: 'ReplicatorPlugin',
          replicatorConfig: rep,
          suggestion: 'Each replicator entry must specify a driver: { driver: "s3db", resources: {...} }'
        });
      }
      if (!rep.resources || typeof rep.resources !== 'object') {
        throw new ReplicationError('Each replicator must have resources config', {
          operation: 'constructor',
          pluginName: 'ReplicatorPlugin',
          driver: rep.driver,
          replicatorConfig: rep,
          suggestion: 'Provide resources as object or array: { driver: "s3db", resources: ["users"] } or { resources: { users: "people" } }'
        });
      }
      if (Object.keys(rep.resources).length === 0) {
        throw new ReplicationError('Each replicator must have at least one resource configured', {
          operation: 'constructor',
          pluginName: 'ReplicatorPlugin',
          driver: rep.driver,
          replicatorConfig: rep,
          suggestion: 'Add at least one resource to replicate: { driver: "s3db", resources: ["users"] }'
        });
      }
    }
    
    const resourceNamesOption = options.resourceNames || {};
    this.config = {
      replicators: options.replicators || [],
      logErrors: options.logErrors !== false,
      persistReplicatorLog: options.persistReplicatorLog || false,
      enabled: options.enabled !== false,
      batchSize: options.batchSize || 100,
      maxRetries: options.maxRetries || 3,
      timeout: options.timeout || 30000,
      verbose: options.verbose || false
    };
    this.logResourceName = resolveResourceName('replicator', {
      defaultName: 'plg_replicator_logs',
      override: resourceNamesOption.log
    });

    this.replicators = [];
    this.database = null;
    this.eventListenersInstalled = new Set();
    this.eventHandlers = new Map(); // Map<resourceName, {insert, update, delete}>
    this.stats = {
      totalReplications: 0,
      totalErrors: 0,
      lastSync: null
    };
    this._afterCreateResourceHook = null;
    this.replicatorLog = null;
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

  async getCompleteData(resource, data) {
    // Always get the complete record from the resource to ensure we have all data
    // This handles all behaviors: body-overflow, truncate-data, body-only, etc.
    const [ok, err, completeRecord] = await tryFn(() => resource.get(data.id));
    return ok ? completeRecord : data;
  }

  installEventListeners(resource, database, plugin) {
    if (!resource || this.eventListenersInstalled.has(resource.name) ||
        resource.name === this.logResourceName) {
      return;
    }

    // Create handler functions and save references for later removal
    const insertHandler = async (data) => {
      const [ok, error] = await tryFn(async () => {
        const completeData = { ...data, createdAt: new Date().toISOString() };
        await plugin.processReplicatorEvent('insert', resource.name, completeData.id, completeData);
      });

      if (!ok) {
        if (this.config.verbose) {
          console.warn(`[ReplicatorPlugin] Insert event failed for resource ${resource.name}: ${error.message}`);
        }
        this.emit('plg:replicator:error', { operation: 'insert', error: error.message, resource: resource.name });
      }
    };

    const updateHandler = async (data, beforeData) => {
      const [ok, error] = await tryFn(async () => {
        // For updates, we need to get the complete updated record, not just the changed fields
        const completeData = await plugin.getCompleteData(resource, data);
        const dataWithTimestamp = { ...completeData, updatedAt: new Date().toISOString() };
        await plugin.processReplicatorEvent('update', resource.name, completeData.id, dataWithTimestamp, beforeData);
      });

      if (!ok) {
        if (this.config.verbose) {
          console.warn(`[ReplicatorPlugin] Update event failed for resource ${resource.name}: ${error.message}`);
        }
        this.emit('plg:replicator:error', { operation: 'update', error: error.message, resource: resource.name });
      }
    };

    const deleteHandler = async (data) => {
      const [ok, error] = await tryFn(async () => {
        await plugin.processReplicatorEvent('delete', resource.name, data.id, data);
      });

      if (!ok) {
        if (this.config.verbose) {
          console.warn(`[ReplicatorPlugin] Delete event failed for resource ${resource.name}: ${error.message}`);
        }
        this.emit('plg:replicator:error', { operation: 'delete', error: error.message, resource: resource.name });
      }
    };

    // Save handler references
    this.eventHandlers.set(resource.name, {
      inserted: insertHandler,
      updated: updateHandler,
      deleted: deleteHandler
    });

    // Attach listeners (use standardized past tense event names)
    resource.on('inserted', insertHandler);
    resource.on('updated', updateHandler);
    resource.on('deleted', deleteHandler);

    this.eventListenersInstalled.add(resource.name);
  }

  async onInstall() {
    // Create replicator log resource if enabled
    if (this.config.persistReplicatorLog) {
      const logResourceName = this.logResourceName;
      const [ok, err, logResource] = await tryFn(() => this.database.createResource({
        name: logResourceName,
        attributes: {
          id: 'string|required',
          resource: 'string|required',
          action: 'string|required',
          data: 'json',
          timestamp: 'number|required',
          createdAt: 'string|required'
        },
        behavior: 'truncate-data'
      }));

      if (ok) {
        this.replicatorLog = logResource;
      } else {
        const existing = this.database.resources[logResourceName];
        if (existing) {
          this.replicatorLog = existing;
        } else {
          throw err;
        }
      }
    }

    // Initialize replicators
    await this.initializeReplicators(this.database);

    // Use database hooks for automatic resource discovery
    this.installDatabaseHooks();

    // Install event listeners for existing resources
    for (const resource of Object.values(this.database.resources)) {
      if (resource.name !== this.logResourceName) {
        this.installEventListeners(resource, this.database, this);
      }
    }
  }

  async start() {
    // Plugin is ready
  }

  installDatabaseHooks() {
    // Store hook reference for later removal
    this._afterCreateResourceHook = (resource) => {
      if (resource.name !== this.logResourceName) {
        this.installEventListeners(resource, this.database, this);
      }
    };

    this.database.addHook('afterCreateResource', this._afterCreateResourceHook);
  }

  removeDatabaseHooks() {
    // Remove the hook we added using stored reference
    if (this._afterCreateResourceHook) {
      this.database.removeHook('afterCreateResource', this._afterCreateResourceHook);
      this._afterCreateResourceHook = null;
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

  async uploadMetadataFile(database) {
    if (typeof this.database.uploadMetadataFile === 'function') {
      await this.database.uploadMetadataFile();
    }
  }

  async retryWithBackoff(operation, maxRetries = 3) {
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const [ok, error, result] = await tryFn(operation);

      if (ok) {
        return result;
      } else {
        lastError = error;
        if (this.config.verbose) {
          console.warn(`[ReplicatorPlugin] Retry attempt ${attempt}/${maxRetries} failed: ${error.message}`);
        }

        if (attempt === maxRetries) {
          throw error;
        }
        // Simple backoff: wait 1s, 2s, 4s...
        const delay = Math.pow(2, attempt - 1) * 1000;
        if (this.config.verbose) {
          console.warn(`[ReplicatorPlugin] Waiting ${delay}ms before retry...`);
        }
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw lastError;
  }

  async logError(replicator, resourceName, operation, recordId, data, error) {
    const [ok, logError] = await tryFn(async () => {
      if (this.replicatorLog) {
        await this.replicatorLog.insert({
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
    });
    
    if (!ok) {
      if (this.config.verbose) {
        console.warn(`[ReplicatorPlugin] Failed to log error for ${resourceName}: ${logError.message}`);
      }
      this.emit('plg:replicator:log-error', {
        replicator: replicator.name || replicator.id,
        resourceName,
        operation,
        recordId,
        originalError: error.message,
        logError: logError.message
      });
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
      const [ok, error, result] = await tryFn(async () => {
        const result = await this.retryWithBackoff(
          () => replicator.replicate(resourceName, operation, data, recordId, beforeData),
          this.config.maxRetries
        );
        
        this.emit('plg:replicator:replicated', {
          replicator: replicator.name || replicator.id,
          resourceName,
          operation,
          recordId,
          result,
          success: true
        });

        return result;
      });
      
      if (ok) {
        return result;
      } else {
        if (this.config.verbose) {
          console.warn(`[ReplicatorPlugin] Replication failed for ${replicator.name || replicator.id} on ${resourceName}: ${error.message}`);
        }
        
        this.emit('plg:replicator:error', {
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

  async processReplicatorItem(item) {
    const applicableReplicators = this.replicators.filter(replicator => {
      const should = replicator.shouldReplicateResource && replicator.shouldReplicateResource(item.resourceName, item.operation);
      return should;
    });

    if (applicableReplicators.length === 0) {
      return;
    }

    const promises = applicableReplicators.map(async (replicator) => {
      const [wrapperOk, wrapperError] = await tryFn(async () => {
        const [ok, err, result] = await tryFn(() => 
          replicator.replicate(item.resourceName, item.operation, item.data, item.recordId, item.beforeData)
        );

        if (!ok) {
          if (this.config.verbose) {
            console.warn(`[ReplicatorPlugin] Replicator item processing failed for ${replicator.name || replicator.id} on ${item.resourceName}: ${err.message}`);
          }
          
          this.emit('plg:replicator:error', {
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

        this.emit('plg:replicator:replicated', {
          replicator: replicator.name || replicator.id,
          resourceName: item.resourceName,
          operation: item.operation,
          recordId: item.recordId,
          result,
          success: true
        });

        return { success: true, result };
      });
      
      if (wrapperOk) {
        return wrapperOk;
      } else {
        if (this.config.verbose) {
          console.warn(`[ReplicatorPlugin] Wrapper processing failed for ${replicator.name || replicator.id} on ${item.resourceName}: ${wrapperError.message}`);
        }
        
        this.emit('plg:replicator:error', {
          replicator: replicator.name || replicator.id,
          resourceName: item.resourceName,
          operation: item.operation,
          recordId: item.recordId,
          error: wrapperError.message
        });

        if (this.config.logErrors && this.database) {
          await this.logError(replicator, item.resourceName, item.operation, item.recordId, item.data, wrapperError);
        }

        return { success: false, error: wrapperError.message };
      }
    });

    return Promise.allSettled(promises);
  }

  async logReplicator(item) {
    // Always use the saved reference
    const logRes = this.replicatorLog;
    if (!logRes) {
      this.emit('plg:replicator:log-failed', { error: 'replicator log resource not found', item });
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
    const [ok, err] = await tryFn(async () => {
      await logRes.insert(logItem);
    });
    
    if (!ok) {
      if (this.config.verbose) {
        console.warn(`[ReplicatorPlugin] Failed to log replicator item: ${err.message}`);
      }
      this.emit('plg:replicator:log-failed', { error: err, item });
    }
  }

  async updateReplicatorLog(logId, updates) {
    if (!this.replicatorLog) return;

    const [ok, err] = await tryFn(async () => {
      // Use patch() for 40-60% performance improvement (truncate-data behavior)
      await this.replicatorLog.patch(logId, {
        ...updates,
        lastAttempt: new Date().toISOString()
      });
    });
    if (!ok) {
      this.emit('plg:replicator:update-log-failed', { error: err.message, logId, updates });
    }
  }

  // Utility methods
  async getReplicatorStats() {
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
      stats: this.stats,
      lastSync: this.stats.lastSync
    };
  }

  async getReplicatorLogs(options = {}) {
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

    const filter = {};

    if (resourceName) {
      filter.resourceName = resourceName;
    }

    if (operation) {
      filter.operation = operation;
    }

    if (status) {
      filter.status = status;
    }

    const logs = await this.replicatorLog.query(filter, { limit, offset });

    return logs || [];
  }

  async retryFailedReplicators() {
    if (!this.replicatorLog) {
      return { retried: 0 };
    }

    const failedLogs = await this.replicatorLog.query({
      status: 'failed'
    });

    let retried = 0;

    for (const log of failedLogs || []) {
      const [ok, err] = await tryFn(async () => {
        // Re-queue the replicator
        await this.processReplicatorEvent(
          log.operation,
          log.resourceName,
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
      throw new ReplicationError('Replicator not found', {
        operation: 'syncAllData',
        pluginName: 'ReplicatorPlugin',
        replicatorId,
        availableReplicators: this.replicators.map(r => r.id),
        suggestion: 'Check replicator ID or use getReplicatorStats() to list available replicators'
      });
    }

    this.stats.lastSync = new Date().toISOString();

    for (const resourceName in this.database.resources) {
      if (resourceName === this.logResourceName) continue;

      if (replicator.shouldReplicateResource(resourceName)) {
        this.emit('plg:replicator:sync-resource', { resourceName, replicatorId });

        const resource = this.database.resources[resourceName];

        // Use pagination to avoid memory issues
        let offset = 0;
        const pageSize = this.config.batchSize || 100;

        while (true) {
          const [ok, err, page] = await tryFn(() => resource.page({ offset, size: pageSize }));

          if (!ok || !page) break;

          const records = Array.isArray(page) ? page : (page.items || []);
          if (records.length === 0) break;

          for (const record of records) {
            await replicator.replicate(resourceName, 'insert', record, record.id);
          }

          offset += pageSize;
        }
      }
    }

    this.emit('plg:replicator:sync-completed', { replicatorId, stats: this.stats });
  }

  async stop() {
    const [ok, error] = await tryFn(async () => {
      if (this.replicators && this.replicators.length > 0) {
        const cleanupPromises = this.replicators.map(async (replicator) => {
          const [replicatorOk, replicatorError] = await tryFn(async () => {
            if (replicator && typeof replicator.stop === 'function') {
              await replicator.stop();
            }
          });

          if (!replicatorOk) {
            if (this.config.verbose) {
              console.warn(`[ReplicatorPlugin] Failed to stop replicator ${replicator.name || replicator.id}: ${replicatorError.message}`);
            }
            this.emit('plg:replicator:stop-error', {
              replicator: replicator.name || replicator.id || 'unknown',
              driver: replicator.driver || 'unknown',
              error: replicatorError.message
            });
          }
        });
        
        await Promise.allSettled(cleanupPromises);
      }

      // Remove database hooks
      this.removeDatabaseHooks();

      // Remove event listeners from resources to prevent memory leaks
      if (this.database && this.database.resources) {
        for (const resourceName of this.eventListenersInstalled) {
          const resource = this.database.resources[resourceName];
          const handlers = this.eventHandlers.get(resourceName);

          if (resource && handlers) {
            resource.off('inserted', handlers.inserted);
            resource.off('updated', handlers.updated);
            resource.off('deleted', handlers.deleted);
          }
        }
      }

      this.replicators = [];
      this.database = null;
      this.eventListenersInstalled.clear();
      this.eventHandlers.clear();

      this.removeAllListeners();
    });
    
    if (!ok) {
      if (this.config.verbose) {
        console.warn(`[ReplicatorPlugin] Failed to stop plugin: ${error.message}`);
      }
      this.emit('plg:replicator:plugin-stop-error', {
        error: error.message
      });
    }
  }
} 
