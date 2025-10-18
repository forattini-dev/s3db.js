import Plugin from "./plugin.class.js";
import tryFn from "../concerns/try-fn.js";
import { idGenerator } from "../concerns/id.js";

/**
 * TTLPlugin - Time-To-Live Auto-Cleanup System
 *
 * Automatically removes or archives expired records based on configurable TTL rules.
 * Supports multiple expiration strategies including soft delete, hard delete, archiving,
 * and custom callbacks.
 *
 * === Features ===
 * - Periodic scanning for expired records
 * - Multiple expiration strategies (soft-delete, hard-delete, archive, callback)
 * - Efficient batch processing
 * - Event monitoring and statistics
 * - Resource-specific TTL configuration
 * - Custom expiration field support (createdAt, expiresAt, etc)
 *
 * === Configuration Example ===
 *
 * new TTLPlugin({
 *   checkInterval: 300000,  // Check every 5 minutes (default)
 *   batchSize: 100,         // Process 100 records at a time
 *   verbose: true,          // Enable logging
 *
 *   resources: {
 *     sessions: {
 *       ttl: 86400,              // 24 hours in seconds
 *       field: 'expiresAt',      // Field to check expiration
 *       onExpire: 'soft-delete',  // Strategy: soft-delete, hard-delete, archive, callback
 *       deleteField: 'deletedAt' // Field to mark as deleted (soft-delete only)
 *     },
 *
 *     temp_uploads: {
 *       ttl: 3600,               // 1 hour
 *       field: 'createdAt',
 *       onExpire: 'hard-delete'  // Permanently delete from S3
 *     },
 *
 *     old_orders: {
 *       ttl: 2592000,            // 30 days
 *       field: 'createdAt',
 *       onExpire: 'archive',
 *       archiveResource: 'archive_orders'  // Copy to this resource before deleting
 *     },
 *
 *     custom_cleanup: {
 *       ttl: 7200,               // 2 hours
 *       field: 'expiresAt',
 *       onExpire: 'callback',
 *       callback: async (record, resource) => {
 *         // Custom cleanup logic
 *         console.log(`Cleaning up ${record.id}`);
 *         await someCustomCleanup(record);
 *         return true; // Return true to delete, false to keep
 *       }
 *     }
 *   }
 * })
 *
 * === Expiration Strategies ===
 *
 * 1. soft-delete: Marks record as deleted without removing from S3
 *    - Adds/updates deleteField (default: 'deletedAt') with current timestamp
 *    - Record remains in database but marked as deleted
 *    - Useful for maintaining history and allowing undelete
 *
 * 2. hard-delete: Permanently removes record from S3
 *    - Uses resource.delete() to remove the record
 *    - Cannot be recovered
 *    - Frees up S3 storage immediately
 *
 * 3. archive: Copies record to another resource before deleting
 *    - Inserts record into archiveResource
 *    - Then performs hard-delete on original
 *    - Preserves data while keeping main resource clean
 *
 * 4. callback: Custom logic via callback function
 *    - Executes callback(record, resource)
 *    - Callback returns true to delete, false to keep
 *    - Allows complex conditional logic
 *
 * === Events ===
 *
 * - recordExpired: Emitted for each expired record
 * - batchExpired: Emitted after processing a batch
 * - scanCompleted: Emitted after completing a full scan
 * - cleanupError: Emitted when cleanup fails
 */
class TTLPlugin extends Plugin {
  constructor(config = {}) {
    super(config);

    this.checkInterval = config.checkInterval || 300000; // 5 minutes default
    this.batchSize = config.batchSize || 100;
    this.verbose = config.verbose !== undefined ? config.verbose : false;
    this.resources = config.resources || {};

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

    // Interval handle
    this.intervalHandle = null;
    this.isRunning = false;
  }

  /**
   * Install the plugin
   */
  async install(database) {
    await super.install(database);

    // Validate resource configurations
    for (const [resourceName, config] of Object.entries(this.resources)) {
      this._validateResourceConfig(resourceName, config);
    }

    // Start interval
    if (this.checkInterval > 0) {
      this._startInterval();
    }

    if (this.verbose) {
      console.log(`[TTLPlugin] Installed with ${Object.keys(this.resources).length} resources`);
      console.log(`[TTLPlugin] Check interval: ${this.checkInterval}ms`);
    }

    this.emit('installed', {
      plugin: 'TTLPlugin',
      resources: Object.keys(this.resources),
      checkInterval: this.checkInterval
    });
  }

  /**
   * Validate resource configuration
   */
  _validateResourceConfig(resourceName, config) {
    if (!config.ttl || typeof config.ttl !== 'number') {
      throw new Error(`[TTLPlugin] Resource "${resourceName}" must have a numeric "ttl" value`);
    }

    if (!config.field || typeof config.field !== 'string') {
      throw new Error(`[TTLPlugin] Resource "${resourceName}" must have a "field" string`);
    }

    const validStrategies = ['soft-delete', 'hard-delete', 'archive', 'callback'];
    if (!config.onExpire || !validStrategies.includes(config.onExpire)) {
      throw new Error(
        `[TTLPlugin] Resource "${resourceName}" must have an "onExpire" value. ` +
        `Valid options: ${validStrategies.join(', ')}`
      );
    }

    if (config.onExpire === 'soft-delete' && !config.deleteField) {
      config.deleteField = 'deletedAt'; // Default
    }

    if (config.onExpire === 'archive' && !config.archiveResource) {
      throw new Error(
        `[TTLPlugin] Resource "${resourceName}" with onExpire="archive" must have an "archiveResource" specified`
      );
    }

    if (config.onExpire === 'callback' && typeof config.callback !== 'function') {
      throw new Error(
        `[TTLPlugin] Resource "${resourceName}" with onExpire="callback" must have a "callback" function`
      );
    }
  }

  /**
   * Start the cleanup interval
   */
  _startInterval() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
    }

    this.intervalHandle = setInterval(async () => {
      await this.runCleanup();
    }, this.checkInterval);

    if (this.verbose) {
      console.log(`[TTLPlugin] Started cleanup interval: every ${this.checkInterval}ms`);
    }
  }

  /**
   * Stop the cleanup interval
   */
  _stopInterval() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;

      if (this.verbose) {
        console.log('[TTLPlugin] Stopped cleanup interval');
      }
    }
  }

  /**
   * Run cleanup for all configured resources
   */
  async runCleanup() {
    if (this.isRunning) {
      if (this.verbose) {
        console.log('[TTLPlugin] Cleanup already running, skipping this cycle');
      }
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      this.stats.totalScans++;

      if (this.verbose) {
        console.log(`[TTLPlugin] Starting cleanup scan #${this.stats.totalScans}`);
      }

      const results = [];

      for (const [resourceName, config] of Object.entries(this.resources)) {
        const result = await this._cleanupResource(resourceName, config);
        results.push(result);
      }

      const totalExpired = results.reduce((sum, r) => sum + r.expired, 0);
      const totalProcessed = results.reduce((sum, r) => sum + r.processed, 0);
      const totalErrors = results.reduce((sum, r) => sum + r.errors, 0);

      this.stats.lastScanAt = new Date().toISOString();
      this.stats.lastScanDuration = Date.now() - startTime;
      this.stats.totalExpired += totalExpired;
      this.stats.totalErrors += totalErrors;

      if (this.verbose) {
        console.log(
          `[TTLPlugin] Scan #${this.stats.totalScans} completed in ${this.stats.lastScanDuration}ms - ` +
          `Expired: ${totalExpired}, Processed: ${totalProcessed}, Errors: ${totalErrors}`
        );
      }

      this.emit('scanCompleted', {
        scan: this.stats.totalScans,
        duration: this.stats.lastScanDuration,
        totalExpired,
        totalProcessed,
        totalErrors,
        results
      });

    } catch (error) {
      this.stats.totalErrors++;

      if (this.verbose) {
        console.error(`[TTLPlugin] Cleanup scan failed:`, error.message);
      }

      this.emit('cleanupError', {
        error: error.message,
        scan: this.stats.totalScans
      });
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Cleanup a specific resource
   */
  async _cleanupResource(resourceName, config) {
    const [ok, err, result] = await tryFn(async () => {
      const resource = this.database.resource(resourceName);
      if (!resource) {
        throw new Error(`Resource "${resourceName}" not found`);
      }

      // Calculate expiration timestamp
      const expirationTime = Date.now() - (config.ttl * 1000);
      const expirationDate = new Date(expirationTime);

      if (this.verbose) {
        console.log(
          `[TTLPlugin] Checking ${resourceName} for records expired before ${expirationDate.toISOString()}`
        );
      }

      // List expired records
      // Note: This is a simple implementation. For better performance with large datasets,
      // consider using partitions by date
      const allRecords = await resource.list({ limit: 10000 }); // Limit for safety
      const expiredRecords = allRecords.filter(record => {
        if (!record[config.field]) return false;

        const fieldValue = record[config.field];
        let timestamp;

        // Handle different field formats
        if (typeof fieldValue === 'number') {
          timestamp = fieldValue;
        } else if (typeof fieldValue === 'string') {
          timestamp = new Date(fieldValue).getTime();
        } else if (fieldValue instanceof Date) {
          timestamp = fieldValue.getTime();
        } else {
          return false;
        }

        return timestamp < expirationTime;
      });

      if (expiredRecords.length === 0) {
        if (this.verbose) {
          console.log(`[TTLPlugin] No expired records found in ${resourceName}`);
        }
        return { expired: 0, processed: 0, errors: 0 };
      }

      if (this.verbose) {
        console.log(`[TTLPlugin] Found ${expiredRecords.length} expired records in ${resourceName}`);
      }

      // Process in batches
      let processed = 0;
      let errors = 0;

      for (let i = 0; i < expiredRecords.length; i += this.batchSize) {
        const batch = expiredRecords.slice(i, i + this.batchSize);

        for (const record of batch) {
          const [processOk, processErr] = await tryFn(async () => {
            await this._processExpiredRecord(resourceName, resource, record, config);
          });

          if (processOk) {
            processed++;
          } else {
            errors++;
            if (this.verbose) {
              console.error(
                `[TTLPlugin] Failed to process record ${record.id} in ${resourceName}:`,
                processErr.message
              );
            }
          }
        }

        this.emit('batchExpired', {
          resource: resourceName,
          batchSize: batch.length,
          processed,
          errors
        });
      }

      return {
        expired: expiredRecords.length,
        processed,
        errors
      };
    });

    if (!ok) {
      if (this.verbose) {
        console.error(`[TTLPlugin] Error cleaning up ${resourceName}:`, err.message);
      }

      this.emit('cleanupError', {
        resource: resourceName,
        error: err.message
      });

      return { expired: 0, processed: 0, errors: 1 };
    }

    return result;
  }

  /**
   * Process a single expired record based on strategy
   */
  async _processExpiredRecord(resourceName, resource, record, config) {
    this.emit('recordExpired', {
      resource: resourceName,
      recordId: record.id,
      strategy: config.onExpire
    });

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
        await this._archive(resourceName, resource, record, config);
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
  }

  /**
   * Soft delete: Mark record as deleted
   */
  async _softDelete(resource, record, config) {
    const deleteField = config.deleteField || 'deletedAt';
    await resource.update(record.id, {
      [deleteField]: new Date().toISOString()
    });

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
      console.log(`[TTLPlugin] Hard-deleted record ${record.id} from ${resource.name}`);
    }
  }

  /**
   * Archive: Copy to another resource then delete
   */
  async _archive(resourceName, resource, record, config) {
    const archiveResource = this.database.resource(config.archiveResource);
    if (!archiveResource) {
      throw new Error(
        `Archive resource "${config.archiveResource}" not found for resource "${resourceName}"`
      );
    }

    // Copy to archive
    const archiveData = {
      ...record,
      _archivedAt: new Date().toISOString(),
      _archivedFrom: resourceName,
      _originalId: record.id
    };

    // Generate new ID for archive if needed
    if (!config.keepOriginalId) {
      archiveData.id = idGenerator();
    }

    await archiveResource.insert(archiveData);

    // Delete from original
    await this._hardDelete(resource, record);

    if (this.verbose) {
      console.log(
        `[TTLPlugin] Archived record ${record.id} from ${resourceName} to ${config.archiveResource}`
      );
    }
  }

  /**
   * Get plugin statistics
   */
  getStats() {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      checkInterval: this.checkInterval,
      resources: Object.keys(this.resources).length
    };
  }

  /**
   * Manually trigger cleanup for a specific resource
   */
  async cleanupResource(resourceName) {
    const config = this.resources[resourceName];
    if (!config) {
      throw new Error(`Resource "${resourceName}" not configured in TTLPlugin`);
    }

    return await this._cleanupResource(resourceName, config);
  }

  /**
   * Uninstall the plugin
   */
  async uninstall() {
    this._stopInterval();

    if (this.verbose) {
      console.log('[TTLPlugin] Uninstalled');
    }

    this.emit('uninstalled', {
      plugin: 'TTLPlugin',
      stats: this.stats
    });

    await super.uninstall();
  }
}

export default TTLPlugin;
