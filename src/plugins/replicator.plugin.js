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
    if (options.verbose) {
      console.log('[PLUGIN][CONSTRUCTOR] ReplicatorPlugin constructor called');
    }
    if (options.verbose) {
      console.log('[PLUGIN][constructor] New ReplicatorPlugin instance created with config:', options);
    }
    // Validation for config tests
    if (!options.replicators || !Array.isArray(options.replicators)) {
      throw new Error('ReplicatorPlugin: replicators array is required');
    }
    for (const rep of options.replicators) {
      if (!rep.driver) throw new Error('ReplicatorPlugin: each replicator must have a driver');
    }
    // Aceita apenas os parâmetros válidos
    this.config = {
      verbose: options.verbose ?? false,
      persistReplicatorLog: options.persistReplicatorLog ?? false,
      replicatorLogResource: options.replicatorLogResource ?? 'replicator_logs',
      replicators: options.replicators || [],
    };
    this.replicators = [];
    this.queue = [];
    this.isProcessing = false;
    this.stats = {
      totalOperations: 0,
      totalErrors: 0,
      lastError: null,
    };
    this._installedListeners = [];
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

  installEventListeners(resource) {
    const plugin = this;
    if (plugin.config.verbose) {
      console.log('[PLUGIN] installEventListeners called for:', resource && resource.name, {
        hasDatabase: !!resource.database,
        sameDatabase: resource.database === plugin.database,
        alreadyInstalled: resource._replicatorListenersInstalled,
        resourceObj: resource,
        resourceObjId: resource && resource.id,
        resourceObjType: typeof resource,
        resourceObjIs: resource && Object.is(resource, plugin.database.resources && plugin.database.resources[resource.name]),
        resourceObjEq: resource === (plugin.database.resources && plugin.database.resources[resource.name])
      });
    }
    // Only install listeners on resources belonging to the source database
    if (!resource || resource.name === plugin.config.replicatorLogResource || !resource.database || resource.database !== plugin.database) return;
    if (resource._replicatorListenersInstalled) return;
    resource._replicatorListenersInstalled = true;
    // Track listeners for cleanup
    this._installedListeners.push(resource);
    if (plugin.config.verbose) {
      console.log(`[PLUGIN] installEventListeners INSTALLED for resource: ${resource && resource.name}`);
    }
    // Insert event
    resource.on('insert', async (data) => {
      if (plugin.config.verbose) {
        console.log('[PLUGIN] Listener INSERT on', resource.name, 'plugin.replicators.length:', plugin.replicators.length, plugin.replicators.map(r => ({id: r.id, driver: r.driver})));
      }
      try {
        const completeData = await plugin.getCompleteData(resource, data);
        if (plugin.config.verbose) {
          console.log(`[PLUGIN] Listener INSERT completeData for ${resource.name} id=${data && data.id}:`, completeData);
        }
        await plugin.processReplicatorEvent(resource.name, 'insert', data.id, completeData, null);
      } catch (err) {
        if (plugin.config.verbose) {
          console.error(`[PLUGIN] Listener INSERT error on ${resource.name} id=${data && data.id}:`, err);
        }
      }
    });

    // Update event
    resource.on('update', async (data) => {
      console.log('[PLUGIN][Listener][UPDATE][START] triggered for resource:', resource.name, 'data:', data);
      const beforeData = data && data.$before;
      if (plugin.config.verbose) {
        console.log('[PLUGIN] Listener UPDATE on', resource.name, 'plugin.replicators.length:', plugin.replicators.length, plugin.replicators.map(r => ({id: r.id, driver: r.driver})), 'data:', data, 'beforeData:', beforeData);
      }
      try {
        // Always fetch the full, current object for update replication
        let completeData;
        const [ok, err, record] = await tryFn(() => resource.get(data.id));
        if (ok && record) {
          completeData = record;
        } else {
          completeData = data;
        }
        await plugin.processReplicatorEvent(resource.name, 'update', data.id, completeData, beforeData);
      } catch (err) {
        if (plugin.config.verbose) {
        console.error(`[PLUGIN] Listener UPDATE erro em ${resource.name} id=${data && data.id}:`, err);
        }
      }
    });

    // Delete event
    resource.on('delete', async (data, beforeData) => {
      if (plugin.config.verbose) {
        console.log('[PLUGIN] Listener DELETE on', resource.name, 'plugin.replicators.length:', plugin.replicators.length, plugin.replicators.map(r => ({id: r.id, driver: r.driver})));
      }
      try {
        await plugin.processReplicatorEvent(resource.name, 'delete', data.id, null, beforeData);
      } catch (err) {
        if (plugin.config.verbose) {
        console.error(`[PLUGIN] Listener DELETE erro em ${resource.name} id=${data && data.id}:`, err);
        }
      }
    });
    if (plugin.config.verbose) {
    console.log(`[PLUGIN] Listeners instalados para resource: ${resource && resource.name} (insert: ${resource.listenerCount('insert')}, update: ${resource.listenerCount('update')}, delete: ${resource.listenerCount('delete')})`);
    }
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
    console.log('[PLUGIN][SETUP] setup called');
    if (this.config.verbose) {
      console.log('[PLUGIN][setup] called with database:', database && database.name);
    }
    this.database = database;
    // 1. Sempre crie a resource de log antes de qualquer outra coisa
    if (this.config.persistReplicatorLog) {
      let logRes = database.resources[normalizeResourceName(this.config.replicatorLogResource)];
      if (!logRes) {
        logRes = await database.createResource({
          name: this.config.replicatorLogResource,
          behavior: 'truncate-data',
          attributes: {
            id: 'string|required',
            resource: 'string|required',
            action: 'string|required',
            data: 'object',
            timestamp: 'number|required',
            createdAt: 'string|required',
          },
          partitions: {
            byDate: { fields: { 'createdAt': 'string|maxlength:10' } }
          }
        });
        if (this.config.verbose) {
          console.log('[PLUGIN] Log resource created:', this.config.replicatorLogResource, !!logRes);
        }
      }
      database.resources[normalizeResourceName(this.config.replicatorLogResource)] = logRes;
      this.replicatorLog = logRes; // Salva referência para uso futuro
      if (this.config.verbose) {
        console.log('[PLUGIN] Log resource created and registered:', this.config.replicatorLogResource, !!database.resources[normalizeResourceName(this.config.replicatorLogResource)]);
      }
      // Persist the log resource to metadata
      if (typeof database.uploadMetadataFile === 'function') {
        await database.uploadMetadataFile();
        if (this.config.verbose) {
          console.log('[PLUGIN] uploadMetadataFile called. database.resources keys:', Object.keys(database.resources));
        }
      }
    }
    // 2. Só depois inicialize replicators e listeners
    if (this.config.replicators && this.config.replicators.length > 0 && this.replicators.length === 0) {
      await this.initializeReplicators();
      console.log('[PLUGIN][SETUP] after initializeReplicators, replicators.length:', this.replicators.length);
      if (this.config.verbose) {
        console.log('[PLUGIN][setup] After initializeReplicators, replicators.length:', this.replicators.length, this.replicators.map(r => ({id: r.id, driver: r.driver})));
      }
    }
    // Only install event listeners after replicators are initialized
    for (const resourceName in database.resources) {
      if (normalizeResourceName(resourceName) !== normalizeResourceName(this.config.replicatorLogResource)) {
        this.installEventListeners(database.resources[resourceName]);
      }
    }
    database.on('connected', () => {
      for (const resourceName in database.resources) {
        if (normalizeResourceName(resourceName) !== normalizeResourceName(this.config.replicatorLogResource)) {
          this.installEventListeners(database.resources[resourceName]);
        }
      }
    });
    const originalCreateResource = database.createResource.bind(database);
    database.createResource = async (config) => {
      if (this.config.verbose) {
        console.log('[PLUGIN] createResource proxy called for:', config && config.name);
      }
      const resource = await originalCreateResource(config);
      if (resource && resource.name !== this.config.replicatorLogResource) {
        this.installEventListeners(resource);
      }
      return resource;
    };
    database.on('s3db.resourceCreated', (resourceName) => {
      const resource = database.resources[resourceName];
      if (resource && resource.name !== this.config.replicatorLogResource) {
        this.installEventListeners(resource);
      }
    });
    
    database.on('s3db.resourceUpdated', (resourceName) => {
      const resource = database.resources[resourceName];
      if (resource && resource.name !== this.config.replicatorLogResource) {
        this.installEventListeners(resource);
      }
    });
  }

  async initializeReplicators() {
    console.log('[PLUGIN][INIT] initializeReplicators called');
    for (const replicatorConfig of this.config.replicators) {
      try {
        console.log('[PLUGIN][INIT] processing replicatorConfig:', replicatorConfig);
        const driver = replicatorConfig.driver;
        const resources = replicatorConfig.resources;
        const client = replicatorConfig.client;
        const replicator = createReplicator(driver, replicatorConfig, resources, client);
        if (replicator) {
          // Initialize the replicator with the database
          await replicator.initialize(this.database);
          
          this.replicators.push({
            id: Math.random().toString(36).slice(2),
            driver,
            config: replicatorConfig,
            resources,
            instance: replicator
          });
          console.log('[PLUGIN][INIT] pushed replicator:', driver, resources);
        } else {
          console.log('[PLUGIN][INIT] createReplicator returned null/undefined for driver:', driver);
        }
      } catch (err) {
        console.error('[PLUGIN][INIT] Error creating replicator:', err);
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

  async processReplicatorEvent(resourceName, operation, recordId, data, beforeData = null) {
    if (this.config.verbose) {
      console.log('[PLUGIN][processReplicatorEvent] replicators.length:', this.replicators.length, this.replicators.map(r => ({id: r.id, driver: r.driver})));
      console.log(`[PLUGIN][processReplicatorEvent] operation: ${operation}, resource: ${resourceName}, recordId: ${recordId}, data:`, data, 'beforeData:', beforeData);
    }
    if (this.config.verbose) {
      console.log(`[PLUGIN] processReplicatorEvent: resource=${resourceName} op=${operation} id=${recordId} data=`, data);
    }
    if (this.config.verbose) {
    console.log(`[PLUGIN] processReplicatorEvent: resource=${resourceName} op=${operation} replicators=${this.replicators.length}`);
    }
    if (this.replicators.length === 0) {
      if (this.config.verbose) {
        console.log('[PLUGIN] No replicators registered');
      }
      return;
    }
    const applicableReplicators = this.replicators.filter(replicator => {
      const should = replicator.instance.shouldReplicateResource(resourceName, operation);
      if (this.config.verbose) {
        console.log(`[PLUGIN] Replicator ${replicator.driver} shouldReplicateResource(${resourceName}, ${operation}):`, should);
      }
      return should;
    });
    if (this.config.verbose) {
      console.log(`[PLUGIN] processReplicatorEvent: applicableReplicators for resource=${resourceName}:`, applicableReplicators.map(r => r.driver));
    }
    if (applicableReplicators.length === 0) {
      if (this.config.verbose) {
        console.log('[PLUGIN] No applicable replicators for resource', resourceName);
      }
      return;
    }

    // Filtrar campos internos antes de replicar
    const filteredData = this.filterInternalFields(isPlainObject(data) ? data : { raw: data });
    const filteredBeforeData = beforeData ? this.filterInternalFields(isPlainObject(beforeData) ? beforeData : { raw: beforeData }) : null;

    const item = {
      id: `repl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      resourceName,
      operation,
      recordId,
      data: filteredData,
      beforeData: filteredBeforeData,
      timestamp: new Date().toISOString(),
      attempts: 0
    };

    // Log replicator attempt
    const logId = await this.logreplicator(item);

    // Sempre processa imediatamente (sincrono)
    const [ok, err, result] = await tryFn(async () => this.processreplicatorItem(item));
    if (ok) {
      if (logId) {
        await this.updatereplicatorLog(logId, {
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
    } else {
      if (logId) {
        await this.updatereplicatorLog(logId, {
          status: 'failed',
          attempts: 1,
          error: err.message
        });
      }
      this.stats.failedOperations++;
    }
  }

  async processreplicatorItem(item) {
    if (this.config.verbose) {
      console.log('[PLUGIN][processreplicatorItem] called with item:', item);
    }
    const applicableReplicators = this.replicators.filter(replicator => {
      const should = replicator.instance.shouldReplicateResource(item.resourceName, item.operation);
      if (this.config.verbose) {
        console.log(`[PLUGIN] processreplicatorItem: Replicator ${replicator.driver} shouldReplicateResource(${item.resourceName}, ${item.operation}):`, should);
      }
      return should;
    });
    if (this.config.verbose) {
      console.log(`[PLUGIN] processreplicatorItem: applicableReplicators for resource=${item.resourceName}:`, applicableReplicators.map(r => r.driver));
    }
    if (applicableReplicators.length === 0) {
      if (this.config.verbose) {
        console.log('[PLUGIN] processreplicatorItem: No applicable replicators for resource', item.resourceName);
      }
      return { success: true, skipped: true, reason: 'no_applicable_replicators' };
    }

    const results = [];
    
    for (const replicator of applicableReplicators) {
      let result;
      let ok, err;
      if (this.config.verbose) {
        console.log('[PLUGIN] processReplicatorItem', {
          resource: item.resourceName,
          operation: item.operation,
          data: item.data,
          beforeData: item.beforeData,
          replicator: replicator.instance?.constructor?.name
        });
      }
      if (replicator.instance && replicator.instance.constructor && replicator.instance.constructor.name === 'S3dbReplicator') {
        [ok, err, result] = await tryFn(() => 
          replicator.instance.replicate({
            resource: item.resourceName,
            operation: item.operation,
            data: item.data,
            id: item.recordId,
            beforeData: item.beforeData
          })
        );
      } else {
        [ok, err, result] = await tryFn(() =>
        replicator.instance.replicate(
          item.resourceName,
          item.operation,
          item.data,
          item.recordId,
          item.beforeData
        )
      );
      }
      // Remove or comment out this line:
      // console.log('[PLUGIN] replicate result', { ok, err, result });
      results.push({
          replicatorId: replicator.id,
          driver: replicator.driver,
          success: result && result.success,
          error: result && result.error,
          skipped: result && result.skipped
        });
    }

    return {
      success: results.every(r => r.success || r.skipped),
      results
    };
  }

  async logreplicator(item) {
    // Use sempre a referência salva
    const logRes = this.replicatorLog || this.database.resources[normalizeResourceName(this.config.replicatorLogResource)];
    if (!logRes) {
      if (this.config.verbose) {
      console.error('[PLUGIN] replicator log resource not found!');
      }
      if (this.database) {
        if (this.config.verbose) {
        console.warn('[PLUGIN] database.resources keys:', Object.keys(this.database.resources));
        }
        if (this.database.options && this.database.options.connectionString) {
          if (this.config.verbose) {
          console.warn('[PLUGIN] database connectionString:', this.database.options.connectionString);
          }
        }
      }
      this.emit('replicator.log.failed', { error: 'replicator log resource not found', item });
      return;
    }
    // Corrigir campos obrigatórios do log resource
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
      if (this.config.verbose) {
        console.error('[PLUGIN] Error writing to replicator log:', err);
      }
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
        if (this.config.verbose) {
        console.error('Failed to retry replicator:', err);
        }
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

      if (replicator.instance.shouldReplicateResource(resourceName)) {
        this.emit('replicator.sync.resource', { resourceName, replicatorId });
        
        const resource = this.database.resources[resourceName];
      const allRecords = await resource.getAll();
      
      for (const record of allRecords) {
          await replicator.instance.replicate(resourceName, 'insert', record, record.id);
        }
      }
    }

    this.emit('replicator.sync.completed', { replicatorId, stats: this.stats });
  }

  async cleanup() {
    if (this.config.verbose) {
      console.log('[PLUGIN][CLEANUP] Cleaning up ReplicatorPlugin');
    }
    // Remove all event listeners installed on resources
    if (this._installedListeners && Array.isArray(this._installedListeners)) {
      for (const resource of this._installedListeners) {
        if (resource && typeof resource.removeAllListeners === 'function') {
          resource.removeAllListeners('insert');
          resource.removeAllListeners('update');
          resource.removeAllListeners('delete');
        }
        resource._replicatorListenersInstalled = false;
      }
      this._installedListeners = [];
    }
    // Remove all event listeners from the database
    if (this.database && typeof this.database.removeAllListeners === 'function') {
      this.database.removeAllListeners();
    }
    // Cleanup all replicator instances
    if (this.replicators && Array.isArray(this.replicators)) {
      for (const rep of this.replicators) {
        if (rep.instance && typeof rep.instance.cleanup === 'function') {
          await rep.instance.cleanup();
        }
      }
      this.replicators = [];
    }
    // Clear other internal state
    this.queue = [];
    this.isProcessing = false;
    this.stats = {
      totalOperations: 0,
      totalErrors: 0,
      lastError: null,
    };
    if (this.config.verbose) {
      console.log('[PLUGIN][CLEANUP] ReplicatorPlugin cleanup complete');
    }
  }
}

export default ReplicatorPlugin; 