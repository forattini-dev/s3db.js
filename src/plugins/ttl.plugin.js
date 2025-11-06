import { Plugin } from "./plugin.class.js";
import tryFn from "../concerns/try-fn.js";
import { idGenerator } from "../concerns/id.js";
import { resolveResourceName } from "./concerns/resource-names.js";
import { PluginError } from "../errors.js";

// Time constants (in seconds)
const ONE_MINUTE_SEC = 60;
const ONE_HOUR_SEC = 3600;
const ONE_DAY_SEC = 86400;
const THIRTY_DAYS_SEC = 2592000;

// Time constants (in milliseconds)
const TEN_SECONDS_MS = 10000;
const ONE_MINUTE_MS = 60000;
const TEN_MINUTES_MS = 600000;
const ONE_HOUR_MS = 3600000;
const ONE_DAY_MS = 86400000;
const ONE_WEEK_MS = 604800000;

// Conversion factor
const SECONDS_TO_MS = 1000;

/**
 * TTLPlugin - Time-To-Live Auto-Cleanup System v2
 *
 * Automatically removes or archives expired records based on configurable TTL rules.
 * Uses partition-based indexing for O(1) cleanup performance.
 *
 * === Features ===
 * - Partition-based expiration index (O(1) cleanup)
 * - Multiple granularity intervals (minute, hour, day, week)
 * - Zero full scans
 * - Automatic granularity detection
 * - Simple API (just TTL in most cases)
 * - Multiple expiration strategies (soft-delete, hard-delete, archive, callback)
 *
 * === Configuration Example ===
 *
 * new TTLPlugin({
 *   resources: {
 *     // Simple: just TTL (uses createdAt automatically)
 *     cache: {
 *       ttl: 300,                // 5 minutes
 *       onExpire: 'hard-delete'
 *     },
 *
 *     // Custom: TTL relative to specific field
 *     resetTokens: {
 *       ttl: 3600,               // 1 hour
 *       field: 'sentAt',         // TTL relative to this field
 *       onExpire: 'hard-delete'
 *     },
 *
 *     // Absolute: no TTL, uses field directly
 *     subscriptions: {
 *       field: 'endsAt',         // Absolute expiration date
 *       onExpire: 'soft-delete'
 *     }
 *   },
 *
 *   // Optional: Override cleanup schedule per granularity (cron expressions)
 *   schedules: {
 *     minute: '_/30 * * * * *',    // Every 30 seconds (replace _ with *)
 *     hour: '_/15 * * * *',        // Every 15 minutes (replace _ with *)
 *     day: '0 * * * *',            // Every hour at :00
 *     week: '0 0 * * *'            // Daily at midnight
 *   }
 * })
 */

// Granularity configurations
const GRANULARITIES = {
  minute: {
    threshold: ONE_HOUR_SEC,      // TTL < 1 hour
    cronExpression: '*/10 * * * * *',  // Check every 10 seconds
    cohortsToCheck: 3,            // Check last 3 minutes
    cohortFormat: (date) => date.toISOString().substring(0, 16)  // '2024-10-25T14:30'
  },
  hour: {
    threshold: ONE_DAY_SEC,       // TTL < 24 hours
    cronExpression: '*/10 * * * *',    // Check every 10 minutes
    cohortsToCheck: 2,            // Check last 2 hours
    cohortFormat: (date) => date.toISOString().substring(0, 13)  // '2024-10-25T14'
  },
  day: {
    threshold: THIRTY_DAYS_SEC,   // TTL < 30 days
    cronExpression: '0 * * * *',       // Check every 1 hour (at :00)
    cohortsToCheck: 2,            // Check last 2 days
    cohortFormat: (date) => date.toISOString().substring(0, 10)  // '2024-10-25'
  },
  week: {
    threshold: Infinity,          // TTL >= 30 days
    cronExpression: '0 0 * * *',       // Check every day at midnight
    cohortsToCheck: 2,            // Check last 2 weeks
    cohortFormat: (date) => {
      const year = date.getUTCFullYear();
      const week = getWeekNumber(date);
      return `${year}-W${String(week).padStart(2, '0')}`;  // '2024-W43'
    }
  }
};

/**
 * Get ISO week number
 */
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / ONE_DAY_MS) + 1) / 7);
}

/**
 * Detect granularity based on TTL
 */
function detectGranularity(ttl) {
  if (!ttl) return 'day';  // Default for absolute expiration
  if (ttl < GRANULARITIES.minute.threshold) return 'minute';
  if (ttl < GRANULARITIES.hour.threshold) return 'hour';
  if (ttl < GRANULARITIES.day.threshold) return 'day';
  return 'week';
}

/**
 * Get list of expired cohorts to check
 */
function getExpiredCohorts(granularity, count) {
  const config = GRANULARITIES[granularity];
  const cohorts = [];
  const now = new Date();

  for (let i = 0; i < count; i++) {
    let checkDate;

    switch(granularity) {
      case 'minute':
        checkDate = new Date(now.getTime() - (i * ONE_MINUTE_MS));
        break;
      case 'hour':
        checkDate = new Date(now.getTime() - (i * ONE_HOUR_MS));
        break;
      case 'day':
        checkDate = new Date(now.getTime() - (i * ONE_DAY_MS));
        break;
      case 'week':
        checkDate = new Date(now.getTime() - (i * ONE_WEEK_MS));
        break;
    }

    cohorts.push(config.cohortFormat(checkDate));
  }

  return cohorts;
}

export class TTLPlugin extends Plugin {
  constructor(options = {}) {
    super(options);

    const {
      resources = {},
      batchSize = 100,
      schedules = {},
      resourceFilter,
      resourceAllowlist,
      resourceBlocklist
    } = this.options;

    this.resources = resources;
    this.resourceFilter = this._buildResourceFilter({ resourceFilter, resourceAllowlist, resourceBlocklist });
    this.batchSize = batchSize;

    // Cleanup schedule configuration (cron expressions only)
    this.schedules = schedules;   // { minute: '*/30 * * * * *', hour: '*/15 * * * *', ... }

    // Statistics
    this.stats = {
      totalScans: 0,
      totalExpired: 0,
      totalDeleted: 0,
      totalArchived: 0,
      totalSoftDeleted: 0,
      totalCallbacks: 0,
      totalErrors: 0,
      lastScanAt: null,
      lastScanDuration: 0
    };

    // CronManager (passed by database)
    this.cronManager = null;
    this.isRunning = false;

    // Expiration index (plugin storage)
    const resourceNamesOption = this.options.resourceNames || {};
    this.expirationIndex = null;
    this._indexResourceDescriptor = {
      defaultName: 'plg_ttl_expiration_index',
      override: resourceNamesOption.index || this.options.indexResourceName
    };
    this.indexResourceName = this._resolveIndexResourceName();
  }

  _buildResourceFilter(config = {}) {
    if (typeof config.resourceFilter === 'function') {
      return config.resourceFilter;
    }

    const allow = Array.isArray(config.resourceAllowlist) ? new Set(config.resourceAllowlist) : null;
    const block = Array.isArray(config.resourceBlocklist) ? new Set(config.resourceBlocklist) : null;

    if (allow || block) {
      return (resourceName) => {
        if (allow && allow.size > 0 && !allow.has(resourceName)) {
          return false;
        }
        if (block && block.has(resourceName)) {
          return false;
        }
        return true;
      };
    }

    return () => true;
  }

  /**
   * Install the plugin
   */
  async install(database) {
    await super.install(database);

    // Validate resource configurations
    const managedResources = [];

    for (const [resourceName, config] of Object.entries(this.resources)) {
      if (!this.resourceFilter(resourceName)) {
        if (this.verbose) {
          console.warn(`[TTLPlugin] Resource "${resourceName}" skipped by resource filter`);
        }
        continue;
      }
      this._validateResourceConfig(resourceName, config);
      managedResources.push(resourceName);
    }

    // Create expiration index (plugin storage)
    await this._createExpirationIndex();

    // Setup hooks for each configured resource (skip if resource doesn't exist)
    for (const resourceName of managedResources) {
      this._setupResourceHooks(resourceName, this.resources[resourceName]);
    }

    // Start interval-based cleanup
    this._startIntervals();

    if (this.verbose) {
      console.log(`[TTLPlugin] Installed with ${managedResources.length} resources`);
    }

    this.emit('db:plugin:installed', {
      plugin: 'TTLPlugin',
      resources: managedResources
    });
  }

  _resolveIndexResourceName() {
    return resolveResourceName('ttl', this._indexResourceDescriptor, {
      namespace: this.namespace
    });
  }

  onNamespaceChanged() {
    if (!this._indexResourceDescriptor) return;
    this.indexResourceName = this._resolveIndexResourceName();
  }

  /**
   * Validate resource configuration
   */
  _validateResourceConfig(resourceName, config) {
    // Must have either ttl or field
    if (!config.ttl && !config.field) {
      throw new PluginError('[TTLPlugin] Missing TTL configuration', {
        pluginName: 'TTLPlugin',
        operation: 'validateResourceConfig',
        resourceName,
        statusCode: 400,
        retriable: false,
        suggestion: 'Provide either ttl (in seconds) or field (absolute expiration timestamp) for each resource.'
      });
    }

    const validStrategies = ['soft-delete', 'hard-delete', 'archive', 'callback'];
    if (!config.onExpire || !validStrategies.includes(config.onExpire)) {
      throw new PluginError('[TTLPlugin] Invalid onExpire strategy', {
        pluginName: 'TTLPlugin',
        operation: 'validateResourceConfig',
        resourceName,
        statusCode: 400,
        retriable: false,
        suggestion: `Set onExpire to one of: ${validStrategies.join(', ')}`,
        onExpire: config.onExpire
      });
    }

    if (config.onExpire === 'soft-delete' && !config.deleteField) {
      config.deleteField = 'deletedat';  // Default (lowercase for S3 metadata)
    }

    if (config.onExpire === 'archive' && !config.archiveResource) {
      throw new PluginError('[TTLPlugin] Archive resource required', {
        pluginName: 'TTLPlugin',
        operation: 'validateResourceConfig',
        resourceName,
        statusCode: 400,
        retriable: false,
        suggestion: 'Provide archiveResource pointing to the resource that stores archived records.',
        onExpire: config.onExpire
      });
    }

    if (config.onExpire === 'callback' && typeof config.callback !== 'function') {
      throw new PluginError('[TTLPlugin] Callback handler required', {
        pluginName: 'TTLPlugin',
        operation: 'validateResourceConfig',
        resourceName,
        statusCode: 400,
        retriable: false,
        suggestion: 'Provide a callback function: { onExpire: "callback", callback: async (ctx) => {...} }',
        onExpire: config.onExpire
      });
    }

    // Set default field if not specified
    if (!config.field) {
      config.field = '_createdAt';  // Use internal createdAt timestamp
    }

    // Validate timestamp field availability
    if (config.field === '_createdAt' && this.database) {
      const resource = this.database.resources[resourceName];
      if (resource && resource.$schema.timestamps === false) {
        console.warn(
          `[TTLPlugin] WARNING: Resource "${resourceName}" uses TTL with field "_createdAt" ` +
          `but timestamps are disabled. TTL will be calculated from indexing time, not creation time.`
        );
      }
    }

    // Detect granularity
    config.granularity = detectGranularity(config.ttl);
  }

  /**
   * Create expiration index (plugin resource)
   */
  async _createExpirationIndex() {
    this.expirationIndex = await this.database.createResource({
      name: this.indexResourceName,
      attributes: {
        resourceName: 'string|required',
        recordId: 'string|required',
        expiresAtCohort: 'string|required',
        expiresAtTimestamp: 'number|required',  // Exact expiration timestamp for precise checking
        granularity: 'string|required',
        createdAt: 'number'
      },
      partitions: {
        byExpiresAtCohort: {
          fields: { expiresAtCohort: 'string' }
        }
      },
      asyncPartitions: false  // Sync partitions for deterministic behavior
    });

    if (this.verbose) {
      console.log('[TTLPlugin] Created expiration index with partition');
    }
  }

  /**
   * Setup hooks for a resource
   */
  _setupResourceHooks(resourceName, config) {
    // Check if resource exists BEFORE calling database.resource()
    // because database.resource() returns Promise.reject() for non-existent resources
    if (!this.database.resources[resourceName]) {
      if (this.verbose) {
        console.warn(`[TTLPlugin] Resource "${resourceName}" not found, skipping hooks`);
      }
      return;
    }

    if (!this.resourceFilter(resourceName)) {
      if (this.verbose) {
        console.warn(`[TTLPlugin] Resource "${resourceName}" skipped by resource filter`);
      }
      return;
    }

    const resource = this.database.resources[resourceName];

    // Verify methods exist before adding middleware
    if (typeof resource.insert !== 'function' || typeof resource.delete !== 'function') {
      if (this.verbose) {
        console.warn(`[TTLPlugin] Resource "${resourceName}" missing insert/delete methods, skipping hooks`);
      }
      return;
    }

    // Hook: After insert - add to expiration index
    this.addMiddleware(resource, 'insert', async (next, data, options) => {
      const result = await next(data, options);
      await this._addToIndex(resourceName, result, config);
      return result;
    });

    // Hook: After delete - remove from expiration index
    this.addMiddleware(resource, 'delete', async (next, id, options) => {
      const result = await next(id, options);
      await this._removeFromIndex(resourceName, id);
      return result;
    });

    if (this.verbose) {
      console.log(`[TTLPlugin] Setup hooks for resource "${resourceName}"`);
    }
  }

  /**
   * Add record to expiration index
   */
  async _addToIndex(resourceName, record, config) {
    try {
      // Calculate base timestamp
      let baseTime = record[config.field];

      // Fallback: If using _createdAt but it doesn't exist (timestamps not enabled),
      // use current time. This means TTL starts from NOW, not record creation.
      // A warning is shown during plugin installation if this occurs.
      if (!baseTime && config.field === '_createdAt') {
        baseTime = Date.now();
      }

      if (!baseTime) {
        if (this.verbose) {
          console.warn(
            `[TTLPlugin] Record ${record.id} in ${resourceName} missing field "${config.field}", skipping index`
          );
        }
        return;
      }

      // Calculate expiration timestamp
      const baseTimestamp = typeof baseTime === 'number' ? baseTime : new Date(baseTime).getTime();
      const expiresAt = config.ttl
        ? new Date(baseTimestamp + config.ttl * SECONDS_TO_MS)
        : new Date(baseTimestamp);

      // Calculate cohort
      const cohortConfig = GRANULARITIES[config.granularity];
      const cohort = cohortConfig.cohortFormat(expiresAt);

      // Add to index with deterministic ID for O(1) removal and idempotency
      // Using fixed ID means: same record = same index entry (no duplicates)
      // and we can delete directly without querying (O(1) instead of O(n))
      const indexId = `${resourceName}:${record.id}`;

      await this.expirationIndex.insert({
        id: indexId,
        resourceName,
        recordId: record.id,
        expiresAtCohort: cohort,
        expiresAtTimestamp: expiresAt.getTime(),  // Store exact timestamp for precise checking
        granularity: config.granularity,
        createdAt: Date.now()
      });

      if (this.verbose) {
        console.log(
          `[TTLPlugin] Added ${resourceName}:${record.id} to index ` +
          `(cohort: ${cohort}, granularity: ${config.granularity})`
        );
      }
    } catch (error) {
      console.error(`[TTLPlugin] Error adding to index:`, error);
      this.stats.totalErrors++;
    }
  }

  /**
   * Remove record from expiration index (O(1) using deterministic ID)
   */
  async _removeFromIndex(resourceName, recordId) {
    try {
      // Use deterministic ID for O(1) direct delete (no query needed!)
      const indexId = `${resourceName}:${recordId}`;

      const [ok, err] = await tryFn(() => this.expirationIndex.delete(indexId));

      if (this.verbose && ok) {
        console.log(`[TTLPlugin] Removed index entry for ${resourceName}:${recordId}`);
      }

      // Ignore "not found" errors - record might not have been indexed
      if (!ok && err?.code !== 'NoSuchKey') {
        throw err;
      }
    } catch (error) {
      console.error(`[TTLPlugin] Error removing from index:`, error);
    }
  }

  /**
   * Start cron-based cleanup for each granularity
   * Uses Plugin.scheduleInterval() for auto-tracking and cleanup
   */
  async _startIntervals() {
    if (!this.cronManager) {
      console.warn('[TTLPlugin] CronManager not available, cleanup intervals will not run');
      return;
    }

    // Group resources by granularity
    const byGranularity = {
      minute: [],
      hour: [],
      day: [],
      week: []
    };

    for (const [name, config] of Object.entries(this.resources)) {
      if (!this.resourceFilter(name)) {
        continue;
      }
      byGranularity[config.granularity].push({ name, config });
    }

    // Create cron job for each active granularity
    for (const [granularity, resources] of Object.entries(byGranularity)) {
      if (resources.length === 0) continue;

      const granularityConfig = GRANULARITIES[granularity];

      // Use custom cron expression or default from GRANULARITIES
      const cronExpression = this.schedules[granularity] || granularityConfig.cronExpression;

      // Schedule with cron expression
      await this.scheduleCron(
        cronExpression,
        () => this._cleanupGranularity(granularity, resources),
        `cleanup-${granularity}` // Auto-prefixed with 'ttl-'
      );

      if (this.verbose) {
        const source = this.schedules[granularity] ? 'custom' : 'default';
        console.log(
          `[TTLPlugin] Scheduled ${granularity} cleanup (${source} cron: ${cronExpression}) ` +
          `for ${resources.length} resources`
        );
      }
    }

    this.isRunning = true;
  }

  /**
   * Cleanup expired records for a specific granularity
   */
  async _cleanupGranularity(granularity, resources) {
    const startTime = Date.now();
    this.stats.totalScans++;

    try {
      const granularityConfig = GRANULARITIES[granularity];
      const cohorts = getExpiredCohorts(granularity, granularityConfig.cohortsToCheck);

      if (this.verbose) {
        console.log(`[TTLPlugin] Cleaning ${granularity} granularity, checking cohorts:`, cohorts);
      }

      for (const cohort of cohorts) {
        // Query partition (O(1)!)
        const expired = await this.expirationIndex.listPartition({
          partition: 'byExpiresAtCohort',
          partitionValues: { expiresAtCohort: cohort }
        });

        // Filter by resources in this granularity
        const resourceNames = new Set(resources.map(r => r.name));
        const filtered = expired.filter(e => resourceNames.has(e.resourceName));

        if (this.verbose && filtered.length > 0) {
          console.log(`[TTLPlugin] Found ${filtered.length} expired records in cohort ${cohort}`);
        }

        // Process in batches
        for (let i = 0; i < filtered.length; i += this.batchSize) {
          const batch = filtered.slice(i, i + this.batchSize);

          for (const entry of batch) {
            const config = this.resources[entry.resourceName];
            if (!config || !this.resourceFilter(entry.resourceName)) {
              continue;
            }
            await this._processExpiredEntry(entry, config);
          }
        }
      }

      this.stats.lastScanAt = new Date().toISOString();
      this.stats.lastScanDuration = Date.now() - startTime;

      this.emit('plg:ttl:scan-completed', {
        granularity,
        duration: this.stats.lastScanDuration,
        cohorts
      });
    } catch (error) {
      console.error(`[TTLPlugin] Error in ${granularity} cleanup:`, error);
      this.stats.totalErrors++;
      this.emit('plg:ttl:cleanup-error', { granularity, error });
    }
  }

  /**
   * Process a single expired index entry
   */
  async _processExpiredEntry(entry, config) {
    try {
      // Check if resource exists before calling database.resource()
      if (!this.database.resources[entry.resourceName]) {
        if (this.verbose) {
          console.warn(`[TTLPlugin] Resource "${entry.resourceName}" not found during cleanup, skipping`);
        }
        return;
      }

      const resource = this.database.resources[entry.resourceName];

      // Get the actual record
      const [ok, err, record] = await tryFn(() => resource.get(entry.recordId));
      if (!ok || !record) {
        // Record already deleted, cleanup index
        await this.expirationIndex.delete(entry.id);
        return;
      }

      // Check if record has actually expired using the timestamp from the index
      if (entry.expiresAtTimestamp && Date.now() < entry.expiresAtTimestamp) {
        // Not expired yet, skip
        return;
      }

      // Process based on strategy
      switch (config.onExpire) {
        case 'soft-delete':
          await this._softDelete(resource, record, config);
          this.stats.totalSoftDeleted++;
          break;

        case 'hard-delete':
          await this._hardDelete(resource, record);
          this.stats.totalDeleted++;
          break;

        case 'archive':
          await this._archive(resource, record, config);
          this.stats.totalArchived++;
          this.stats.totalDeleted++;
          break;

        case 'callback':
          const shouldDelete = await config.callback(record, resource);
          this.stats.totalCallbacks++;
          if (shouldDelete) {
            await this._hardDelete(resource, record);
            this.stats.totalDeleted++;
          }
          break;
      }

      // Remove from index
      await this.expirationIndex.delete(entry.id);

      this.stats.totalExpired++;
      this.emit('plg:ttl:record-expired', { resource: entry.resourceName, record });
    } catch (error) {
      console.error(`[TTLPlugin] Error processing expired entry:`, error);
      this.stats.totalErrors++;
    }
  }

  /**
   * Soft delete: Mark record as deleted
   */
  async _softDelete(resource, record, config) {
    const deleteField = config.deleteField || 'deletedat';
    const updates = {
      [deleteField]: new Date().toISOString(),
      isdeleted: 'true'  // Add isdeleted field for partition compatibility
    };

    await resource.update(record.id, updates);

    if (this.verbose) {
      console.log(`[TTLPlugin] Soft-deleted record ${record.id} in ${resource.name}`);
    }
  }

  /**
   * Hard delete: Remove record from S3
   */
  async _hardDelete(resource, record) {
    await resource.delete(record.id);

    if (this.verbose) {
      console.log(`[TTLPlugin] Hard-deleted record ${record.id} in ${resource.name}`);
    }
  }

  /**
   * Archive: Copy to another resource then delete
   */
  async _archive(resource, record, config) {
    // Check if archive resource exists
    if (!this.database.resources[config.archiveResource]) {
      throw new PluginError(`Archive resource "${config.archiveResource}" not found`, {
        pluginName: 'TTLPlugin',
        operation: '_archive',
        resourceName: config.archiveResource,
        statusCode: 404,
        retriable: false,
        suggestion: 'Create the archive resource before using onExpire: "archive" or update archiveResource config.'
      });
    }

    const archiveResource = this.database.resources[config.archiveResource];

    // Copy only user data fields (not system fields like _etag, _lastModified, etc.)
    const archiveData = {};
    for (const [key, value] of Object.entries(record)) {
      // Skip system fields (those starting with _) unless they're user-defined
      if (!key.startsWith('_')) {
        archiveData[key] = value;
      }
    }

    // Add archive metadata (not using _ prefix to avoid system field conflicts)
    archiveData.archivedAt = new Date().toISOString();
    archiveData.archivedFrom = resource.name;
    archiveData.originalId = record.id;

    // Use original ID if configured
    if (!config.keepOriginalId) {
      delete archiveData.id;
    }

    await archiveResource.insert(archiveData);

    // Delete original
    await resource.delete(record.id);

    if (this.verbose) {
      console.log(`[TTLPlugin] Archived record ${record.id} from ${resource.name} to ${config.archiveResource}`);
    }
  }

  /**
   * Manual cleanup of a specific resource
   */
  async cleanupResource(resourceName) {
    const config = this.resources[resourceName];
    if (!config) {
      throw new PluginError(`Resource "${resourceName}" not configured in TTLPlugin`, {
        pluginName: 'TTLPlugin',
        operation: 'cleanupResource',
        resourceName,
        statusCode: 404,
        retriable: false,
        suggestion: 'Add the resource under TTLPlugin configuration before invoking cleanupResource.'
      });
    }

    const granularity = config.granularity;
    await this._cleanupGranularity(granularity, [{ name: resourceName, config }]);

    return {
      resource: resourceName,
      granularity
    };
  }

  /**
   * Manual cleanup of all resources
   */
  async runCleanup() {
    const byGranularity = {
      minute: [],
      hour: [],
      day: [],
      week: []
    };

    for (const [name, config] of Object.entries(this.resources)) {
      byGranularity[config.granularity].push({ name, config });
    }

    for (const [granularity, resources] of Object.entries(byGranularity)) {
      if (resources.length > 0) {
        await this._cleanupGranularity(granularity, resources);
      }
    }
  }

  /**
   * Get plugin statistics
   */
  getStats() {
    return {
      ...this.stats,
      resources: Object.keys(this.resources).length,
      isRunning: this.isRunning,
      cronJobs: this._cronJobs.length
    };
  }

  async onStop() {
    this.isRunning = false;
  }

  /**
   * Uninstall the plugin
   * Auto-cleanup handles cron job cleanup via Plugin.stop()
   */
  async uninstall() {
    await super.uninstall();

    if (this.verbose) {
      console.log('[TTLPlugin] Uninstalled');
    }
  }
}
