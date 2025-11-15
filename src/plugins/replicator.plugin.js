import { PromisePool } from "@supercharge/promise-pool";
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
    super(options);

    const {
      replicators = [],
      resourceNames = {},
      replicatorConcurrency,
      stopConcurrency,
      logErrors = true,
      persistReplicatorLog = false,
      enabled = true,
      batchSize = 100,
      maxRetries = 3,
      timeout = 30000,
      replicatorLogResource
    } = this.options;

    // Validation for config tests
    if (!Array.isArray(replicators) || replicators.length === 0) {
      throw new ReplicationError('ReplicatorPlugin requires replicators array', {
        operation: 'constructor',
        pluginName: 'ReplicatorPlugin',
        providedOptions: Object.keys(this.options),
        suggestion: 'Provide replicators array: new ReplicatorPlugin({ replicators: [{ driver: "s3db", resources: [...] }] })'
      });
    }
    for (const rep of replicators) {
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

    const resolvedReplicatorConcurrency = Number.isFinite(replicatorConcurrency)
      ? Math.max(1, Math.floor(replicatorConcurrency))
      : 5;
    const resolvedStopConcurrency = Number.isFinite(stopConcurrency)
      ? Math.max(1, Math.floor(stopConcurrency))
      : resolvedReplicatorConcurrency;
    this.config = {
      replicators,
      logErrors,
      persistReplicatorLog,
      enabled,
      batchSize,
      maxRetries,
      timeout,
      verbose: this.verbose,
      replicatorConcurrency: resolvedReplicatorConcurrency,
      stopConcurrency: resolvedStopConcurrency
    };
    this._logResourceDescriptor = {
      defaultName: 'plg_replicator_logs',
      override: resourceNames.log || replicatorLogResource
    };
    this.logResourceName = this._resolveLogResourceName();
    this.config.logResourceName = this.logResourceName;

    this.resourceFilter = this._buildResourceFilter(this.options);

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
    this._logResourceHooksInstalled = false;
  }

  _resolveLogResourceName() {
    return resolveResourceName('replicator', this._logResourceDescriptor, {
      namespace: this.namespace,
      applyNamespaceToOverrides: true
    });
  }

  onNamespaceChanged() {
    this.logResourceName = this._resolveLogResourceName();
    if (this.config) {
      this.config.logResourceName = this.logResourceName;
    }
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

  async prepareReplicationData(resource, data) {
    const complete = await this.getCompleteData(resource, data);
    return this.filterInternalFields(complete);
  }

  sanitizeBeforeData(beforeData) {
    if (!beforeData) return null;
    return this.filterInternalFields(beforeData);
  }

  async getCompleteData(resource, data) {
    const [ok, err, completeRecord] = await tryFn(() => resource.get(data.id));
    if (ok && completeRecord) {
      return completeRecord;
    }

    if (this.config.verbose) {
      const reason = err?.message || 'record not found';
      console.warn(`[ReplicatorPlugin] Falling back to provided data for ${resource?.name || 'unknown'}#${data?.id}: ${reason}`);
    }

    return data;
  }

  installEventListeners(resource, database, plugin) {
    if (!resource || this.eventListenersInstalled.has(resource.name) ||
        resource.name === this.logResourceName || !this._shouldManageResource(resource.name)) {
      return;
    }

    // Create handler functions and save references for later removal
    const insertHandler = async (data) => {
      const [ok, error] = await tryFn(async () => {
        const payload = await plugin.prepareReplicationData(resource, data);
        await plugin.processReplicatorEvent('insert', resource.name, payload.id, payload);
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
        const payload = await plugin.prepareReplicationData(resource, data);
        const beforePayload = plugin.sanitizeBeforeData(beforeData);
        await plugin.processReplicatorEvent('update', resource.name, payload.id, payload, beforePayload);
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
        const sanitized = await plugin.prepareReplicationData(resource, data);
        await plugin.processReplicatorEvent('delete', resource.name, sanitized.id, sanitized);
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
          replicator: 'string|required',
          resource: 'string|required',
          action: 'string|required',
          data: 'json',
          timestamp: 'number|required',
          createdAt: 'string|required',
          status: 'string|required',
          error: 'string|optional'
        },
        behavior: 'truncate-data',
        partitions: {
          byDate: {
            fields: {
              createdAt: 'string|maxlength:10'
            }
          }
        }
      }));

      if (ok) {
        this.replicatorLog = logResource;
        this.installReplicatorLogHooks();
      } else {
        const existing = this.database.resources[logResourceName];
        if (existing) {
          this.replicatorLog = existing;
          this.installReplicatorLogHooks();
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
      if (resource.name !== this.logResourceName && this._shouldManageResource(resource.name)) {
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
      if (resource.name !== this.logResourceName && this._shouldManageResource(resource.name)) {
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

  installReplicatorLogHooks() {
    if (!this.replicatorLog || typeof this.replicatorLog.addHook !== 'function') {
      return;
    }

    if (this.replicatorLog._replicatorDefaultsInstalled) {
      this._logResourceHooksInstalled = true;
      return;
    }

    if (this._logResourceHooksInstalled) {
      return;
    }

    const ensureInsertDefaults = (data) => {
      if (!data || typeof data !== 'object') {
        return data;
      }
      this._normalizeLogEntry(data, { assignId: true, ensureTimestamp: true });
      return data;
    };

    const ensureUpdateDefaults = (data) => {
      if (!data || typeof data !== 'object') {
        return data;
      }
      this._normalizeLogEntry(data, { assignId: false, ensureTimestamp: false });
      return data;
    };

    const ensurePatchDefaults = (payload) => {
      if (payload && typeof payload === 'object' && payload.fields && typeof payload.fields === 'object') {
        this._normalizeLogEntry(payload.fields, { assignId: false, ensureTimestamp: false });
      }
      return payload;
    };

    this.replicatorLog.addHook('beforeInsert', ensureInsertDefaults);
    this.replicatorLog.addHook('beforeUpdate', ensureUpdateDefaults);
    this.replicatorLog.addHook('beforePatch', ensurePatchDefaults);

    this.replicatorLog._replicatorDefaultsInstalled = true;
    this._logResourceHooksInstalled = true;
  }

  async createReplicator(driver, config, resources, client) {
    return await createReplicator(driver, config, resources, client);
  }

  async initializeReplicators(database) {
    for (const replicatorConfig of this.config.replicators) {
      const { driver, config = {}, resources, client, ...otherConfig } = replicatorConfig;

      // Extract resources from replicatorConfig or config
      const rawResources = resources || config.resources || {};
      const replicatorResources = this._filterResourcesDefinition(rawResources);

      if (this._resourcesDefinitionIsEmpty(replicatorResources)) {
        if (this.config.verbose) {
          console.warn(`[ReplicatorPlugin] Skipping replicator for driver ${driver} due to resource filter`);
        }
        continue;
      }

      // Merge config with other top-level config options (like queueUrlDefault)
      const mergedConfig = { ...config, ...otherConfig };

      // Pass config, resources, and client in correct order
      const replicator = await this.createReplicator(driver, mergedConfig, replicatorResources, client);
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

  _generateLogEntryId() {
    const random = Math.random().toString(36).slice(2, 8);
    return `repl-${Date.now()}-${random}`;
  }

  _normalizeLogEntry(entry, options = {}) {
    if (!entry || typeof entry !== 'object') {
      return entry;
    }

    const {
      assignId = false,
      ensureTimestamp = false
    } = options;

    if (assignId && !entry.id) {
      entry.id = this._generateLogEntryId();
    }

    const numericTimestamp = Number(entry.timestamp);
    const hasNumericTimestamp = Number.isFinite(numericTimestamp);
    if (hasNumericTimestamp) {
      entry.timestamp = numericTimestamp;
    }

    if (ensureTimestamp && !hasNumericTimestamp) {
      entry.timestamp = Date.now();
    } else if (!ensureTimestamp && entry.timestamp !== undefined && !hasNumericTimestamp) {
      entry.timestamp = Date.now();
    }

    if (!entry.createdAt && entry.timestamp) {
      const iso = new Date(entry.timestamp).toISOString();
      entry.createdAt = iso.slice(0, 10);
    }

    if (ensureTimestamp && !entry.createdAt) {
      const iso = new Date().toISOString();
      entry.createdAt = iso.slice(0, 10);
    }

    if (entry.resourceName || entry.resource) {
      const normalized = normalizeResourceName(entry.resourceName || entry.resource);
      if (normalized) {
        entry.resourceName = normalized;
        if (!entry.resource) {
          entry.resource = normalized;
        }
      }
    }

    if (!entry.action && entry.operation) {
      entry.action = entry.operation;
    }

    if (!entry.operation && entry.action) {
      entry.operation = entry.action;
    }

    if (!entry.replicator) {
      entry.replicator = entry.replicatorId || 'unknown';
    }

    let retryCount = entry.retryCount;
    if (typeof retryCount !== 'number') {
      retryCount = Number(retryCount);
    }

    if (!Number.isFinite(retryCount) || retryCount < 0) {
      entry.retryCount = 0;
    } else {
      entry.retryCount = Math.floor(retryCount);
    }

    if (!entry.status) {
      entry.status = 'pending';
    }

    if (!('error' in entry)) {
      entry.error = null;
    }

    return entry;
  }

  async logError(replicator, resourceName, operation, recordId, data, error) {
    const [ok, logError] = await tryFn(async () => {
      if (this.replicatorLog) {
        const logEntry = {
          id: recordId ? `${resourceName}-${recordId}-${Date.now()}` : undefined,
          replicator: replicator.name || replicator.id || 'unknown',
          resource: resourceName,
          resourceName,
          action: operation,
          operation,
          data: data ? this.filterInternalFields(data) : null,
          status: 'failed',
          error: error?.message,
          retryCount: 0
        };
        this._normalizeLogEntry(logEntry, { assignId: true, ensureTimestamp: true });
        await this.replicatorLog.insert(logEntry);
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

    if (!recordId) {
      throw new ReplicationError('Replication event missing record identifier', {
        operation,
        resourceName,
        pluginName: 'ReplicatorPlugin',
        suggestion: 'Ensure the replicated record contains an id before emitting change events.'
      });
    }

    const sanitizedData = data ? this.filterInternalFields(data) : null;
    const sanitizedBefore = beforeData ? this.filterInternalFields(beforeData) : null;

    const applicableReplicators = this.replicators.filter(replicator => {
      const should = replicator.shouldReplicateResource && replicator.shouldReplicateResource(resourceName, operation);
      return should;
    });

    if (applicableReplicators.length === 0) {
      return;
    }

    const entries = applicableReplicators.map((replicator, index) => ({ replicator, index }));
    const outcomes = new Array(entries.length);

    const poolResult = await PromisePool
      .withConcurrency(this.config.replicatorConcurrency)
      .for(entries)
      .process(async ({ replicator, index }) => {
        const [ok, error, replicationResult] = await tryFn(async () => {
          const result = await this.retryWithBackoff(
            () => replicator.replicate(resourceName, operation, sanitizedData, recordId, sanitizedBefore),
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

          this.stats.totalReplications += 1;

          return result;
        });

        if (ok) {
          outcomes[index] = { status: 'fulfilled', value: replicationResult };
          return replicationResult;
        }

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

        this.stats.totalErrors += 1;

        if (this.config.logErrors && this.database) {
          await this.logError(replicator, resourceName, operation, recordId, data, error);
        }

        outcomes[index] = { status: 'rejected', reason: error };
        throw error;
      });

    if (poolResult.errors.length > 0) {
      for (const { item, error } of poolResult.errors) {
        if (item && typeof item.index === 'number' && !outcomes[item.index]) {
          outcomes[item.index] = { status: 'rejected', reason: error };
        }
      }
    }

    return outcomes;
  }

  async processReplicatorItem(item) {
    const applicableReplicators = this.replicators.filter(replicator => {
      const should = replicator.shouldReplicateResource && replicator.shouldReplicateResource(item.resourceName, item.operation);
      return should;
    });

    if (applicableReplicators.length === 0) {
      return;
    }

    const entries = applicableReplicators.map((replicator, index) => ({ replicator, index }));
    const outcomes = new Array(entries.length);

    await PromisePool
      .withConcurrency(this.config.replicatorConcurrency)
      .for(entries)
      .process(async ({ replicator, index }) => {
        const [wrapperOk, wrapperError] = await tryFn(async () => {
          const preparedData = item.data ? this.filterInternalFields(item.data) : null;
          const preparedBefore = item.beforeData ? this.filterInternalFields(item.beforeData) : null;
          const [ok, err, result] = await tryFn(() =>
            replicator.replicate(item.resourceName, item.operation, preparedData, item.recordId, preparedBefore)
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

            this.stats.totalErrors += 1;
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

          this.stats.totalReplications += 1;

          return { success: true, result };
        });

        if (wrapperOk) {
          outcomes[index] = { status: 'fulfilled', value: wrapperOk };
          return wrapperOk;
        }

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

        this.stats.totalErrors += 1;
        const failure = { success: false, error: wrapperError.message };
        outcomes[index] = { status: 'fulfilled', value: failure };
        return failure;
      });

    return outcomes;
  }

  async logReplicator(item) {
    // Always use the saved reference
    const logRes = this.replicatorLog;
    if (!logRes) {
      this.emit('plg:replicator:log-failed', { error: 'replicator log resource not found', item });
      return;
    }
    const sanitizedData = item.data ? this.filterInternalFields(item.data) : {};

    // Fix required fields of log resource
    const logItem = {
      id: item.id,
      replicator: item.replicator || 'unknown',
      resource: item.resource || item.resourceName || '',
      resourceName: item.resourceName || item.resource || '',
      action: item.operation || item.action || '',
      operation: item.operation || item.action || '',
      data: sanitizedData,
      status: item.status || 'pending',
      error: item.error || null,
      retryCount: item.retryCount || 0
    };
    if (typeof item.timestamp === 'number') {
      logItem.timestamp = item.timestamp;
    }
    if (item.createdAt) {
      logItem.createdAt = item.createdAt;
    }

    this._normalizeLogEntry(logItem, { assignId: true, ensureTimestamp: true });
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
    const entries = this.replicators.map((replicator, index) => ({ replicator, index }));
    const replicatorStats = new Array(entries.length);

    const poolResult = await PromisePool
      .withConcurrency(this.config.replicatorConcurrency)
      .for(entries)
      .process(async ({ replicator, index }) => {
        const status = await replicator.getStatus();
        const info = {
          id: replicator.id,
          driver: replicator.driver,
          config: replicator.config,
          status
        };
        replicatorStats[index] = info;
        return info;
      });

    if (poolResult.errors.length > 0) {
      const { item, error } = poolResult.errors[0];
      const failedReplicator = item?.replicator;
      throw new ReplicationError(`Failed to collect status for replicator ${failedReplicator?.name || failedReplicator?.id || 'unknown'}`, {
        operation: 'getReplicatorStats',
        pluginName: 'ReplicatorPlugin',
        replicatorId: failedReplicator?.id,
        driver: failedReplicator?.driver,
        original: error
      });
    }

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

    const processResult = await PromisePool
      .withConcurrency(this.config.replicatorConcurrency)
      .for(failedLogs || [])
      .process(async (log) => {
        const sanitizedData = log.data ? this.filterInternalFields(log.data) : null;
        const sanitizedBefore = log.beforeData ? this.filterInternalFields(log.beforeData) : null;

        const [ok, err, results] = await tryFn(async () => {
          return await this.processReplicatorEvent(
            log.operation,
            log.resourceName,
            log.recordId,
            sanitizedData,
            sanitizedBefore
          );
        });

        const isSuccessfulEntry = (entry) => {
          if (!entry || entry.status !== 'fulfilled') {
            return false;
          }
          if (entry.value && typeof entry.value === 'object' && 'success' in entry.value) {
            return entry.value.success !== false;
          }
          return true;
        };

        if (ok && Array.isArray(results) && results.every(isSuccessfulEntry)) {
          retried += 1;
          await this.updateReplicatorLog(log.id, {
            status: 'success',
            error: null,
            retryCount: log.retryCount || 0,
            lastSuccessAt: new Date().toISOString()
          });
          return;
        }

        let failureMessage = err?.message || 'Unknown replication failure';

        if (Array.isArray(results)) {
          const failureEntry = results.find((entry) => {
            if (!entry) return false;
            if (entry.status === 'rejected') return true;
            if (entry.status === 'fulfilled' && entry.value && typeof entry.value === 'object' && 'success' in entry.value) {
              return entry.value.success === false;
            }
            return false;
          });

          if (failureEntry) {
            if (failureEntry.status === 'rejected') {
              failureMessage = failureEntry.reason?.message || failureMessage;
            } else if (failureEntry.status === 'fulfilled') {
              failureMessage = failureEntry.value?.error || failureMessage;
            }
          }
        }

        await this.updateReplicatorLog(log.id, {
          status: 'failed',
          error: failureMessage,
          retryCount: (Number(log.retryCount) || 0) + 1
        });
      });

    if (processResult.errors.length && this.config.verbose) {
      for (const { item, error } of processResult.errors) {
        console.warn(`[ReplicatorPlugin] Failed to retry log ${item?.id ?? 'unknown'}: ${error.message}`);
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

          const poolResult = await PromisePool
            .withConcurrency(this.config.replicatorConcurrency)
            .for(records)
            .process(async (record) => {
              const sanitizedRecord = this.filterInternalFields(record);
              const [replicateOk, replicateError, result] = await tryFn(() =>
                replicator.replicate(resourceName, 'insert', sanitizedRecord, sanitizedRecord.id)
              );

              if (!replicateOk) {
                if (this.config.verbose) {
                  console.warn(`[ReplicatorPlugin] syncAllData failed for ${replicator.name || replicator.id} on ${resourceName}: ${replicateError.message}`);
                }

                this.stats.totalErrors += 1;
                this.emit('plg:replicator:error', {
                  replicator: replicator.name || replicator.id,
                  resourceName,
                  operation: 'insert',
                  recordId: sanitizedRecord.id,
                  error: replicateError.message
                });

                if (this.config.logErrors && this.database) {
                  await this.logError(replicator, resourceName, 'insert', sanitizedRecord.id, sanitizedRecord, replicateError);
                }

                throw replicateError;
              }

              this.stats.totalReplications += 1;
              this.emit('plg:replicator:replicated', {
                replicator: replicator.name || replicator.id,
                resourceName,
                operation: 'insert',
                recordId: sanitizedRecord.id,
                result,
                success: true
              });

              return result;
            });

          if (poolResult.errors.length > 0) {
            const { error } = poolResult.errors[0];
            throw error;
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
        await PromisePool
          .withConcurrency(this.config.stopConcurrency)
          .for(this.replicators)
          .process(async (replicator) => {
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

  _buildResourceFilter(options) {
    if (typeof options.resourceFilter === 'function') {
      return options.resourceFilter;
    }

    const allow = Array.isArray(options.resourceAllowlist) ? new Set(options.resourceAllowlist.map(normalizeResourceName)) : null;
    const block = Array.isArray(options.resourceBlocklist) ? new Set(options.resourceBlocklist.map(normalizeResourceName)) : null;

    if (allow || block) {
      return (resourceName) => {
        const normalized = normalizeResourceName(resourceName);
        if (allow && allow.size > 0 && !allow.has(normalized)) {
          return false;
        }
        if (block && block.has(normalized)) {
          return false;
        }
        return true;
      };
    }

    return () => true;
  }

  _shouldManageResource(resourceName) {
    try {
      return this.resourceFilter(normalizeResourceName(resourceName));
    } catch {
      return true;
    }
  }

  _filterResourcesDefinition(definition) {
    if (!definition) return definition;

    if (Array.isArray(definition)) {
      return definition.filter((name) => this._shouldManageResource(name));
    }

    if (typeof definition === 'object') {
      const filtered = {};
      for (const [name, target] of Object.entries(definition)) {
        if (this._shouldManageResource(name)) {
          filtered[name] = target;
        }
      }
      return filtered;
    }

    return definition;
  }

  _resourcesDefinitionIsEmpty(definition) {
    if (!definition) return true;
    if (Array.isArray(definition)) {
      return definition.length === 0;
    }
    if (typeof definition === 'object') {
      return Object.keys(definition).length === 0;
    }
    return false;
  }
}
