/**
 * EventualConsistencyPlugin - Main export
 * Provides eventually consistent counters using transaction log pattern
 * @module eventual-consistency
 */

import { CoordinatorPlugin } from "../concerns/coordinator-plugin.class.js";
import { createConfig, validateResourcesConfig, logConfigWarnings, logInitialization } from "./config.js";
import { detectTimezone, getCohortInfo, createFieldHandler } from "./utils.js";
import { createPartitionConfig } from "./partitions.js";
import { createTransaction } from "./transactions.js";
import {
  consolidateRecord,
  getConsolidatedValue,
  getCohortStats,
  recalculateRecord,
  runConsolidation
} from "./consolidation.js";
import { runGarbageCollection } from "./garbage-collection.js";
import { createTicketsForHandler, claimTickets, processTicket } from "./tickets.js";
import { updateAnalytics, getAnalytics, getMonthByDay, getDayByHour, getLastNDays, getYearByMonth, getYearByWeek, getMonthByWeek, getMonthByHour, getTopRecords, getYearByDay, getWeekByDay, getWeekByHour, getLastNHours, getLastNWeeks, getLastNMonths, getRawEvents } from "./analytics.js";
import { onInstall, onStart, onStop, watchForResource, completeFieldSetup } from "./install.js";

export class EventualConsistencyPlugin extends CoordinatorPlugin {
  constructor(options = {}) {
    super(options);

    const opts = this.options;

    this.resourceFilter = this._buildResourceFilter(opts);

    // Validate resources structure
    validateResourcesConfig(opts.resources);

    // Auto-detect timezone
    const detectedTimezone = detectTimezone();
    const timezoneAutoDetected = !opts.cohort?.timezone;

    // Create shared configuration
    this.config = createConfig({ ...opts, logLevel: this.logLevel }, detectedTimezone);

    // Create field handlers map
    this.fieldHandlers = new Map(); // Map<resourceName, Map<fieldName, handler>>

    // Parse resources configuration
    for (const [resourceName, fields] of Object.entries(opts.resources || {})) {
      if (!this.resourceFilter(resourceName)) {
        continue;
      }
      const resourceHandlers = new Map();
      for (const fieldName of fields) {
        // Create a field handler for each resource/field combination
        resourceHandlers.set(fieldName, createFieldHandler(resourceName, fieldName));
      }
      this.fieldHandlers.set(resourceName, resourceHandlers);
    }

    // Log warnings and initialization
    logConfigWarnings(this.config);
    logInitialization(this.config, this.fieldHandlers, timezoneAutoDetected);
  }

  _buildResourceFilter(options = {}) {
    if (typeof options.resourceFilter === 'function') {
      return options.resourceFilter;
    }

    const allow = Array.isArray(options.resourceAllowlist) ? new Set(options.resourceAllowlist) : null;
    const block = Array.isArray(options.resourceBlocklist) ? new Set(options.resourceBlocklist) : null;

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
   * Install hook - create resources and register helpers
   */
  async onInstall() {
    await onInstall(
      this.database,
      this.fieldHandlers,
      (handler) => completeFieldSetup(handler, this.database, this.config, this),
      (resourceName) => watchForResource(resourceName, this.database, this.fieldHandlers,
        (handler) => completeFieldSetup(handler, this.database, this.config, this)),
      (resourceName) => this.resourceFilter(resourceName)
    );
  }

  /**
   * Start hook - begin timers and emit events
   */
  async onStart() {
    await onStart(
      this.fieldHandlers,
      this.config,
      (handler, resourceName, fieldName) => this._runConsolidationForHandler(handler, resourceName, fieldName),
      (handler, resourceName, fieldName) => this._runGarbageCollectionForHandler(handler, resourceName, fieldName),
      (event, data) => this.emit(event, data)
    );

    // Start coordinator mode if enabled
    if (this.config.enableCoordinator) {
      // Start leader election
      await this.startCoordination();

      // Start worker loop to process tickets (runs on ALL nodes)
      this._startWorkerLoop();

      if (this.config.logLevel) {
        this.logger.info(`[EventualConsistency] Coordinator mode started (workerId: ${this.workerId})`);
      }
    }
  }

  /**
   * Stop hook - stop timers and flush pending
   */
  async onStop() {
    await onStop(
      this.fieldHandlers,
      (event, data) => this.emit(event, data)
    );

    // Stop worker loop
    if (this._workerLoopHandle) {
      if (this._workerLoopHandle.stop) this._workerLoopHandle.stop();
      else clearInterval(this._workerLoopHandle);
      this._workerLoopHandle = null;
    }
  }

  /**
   * Start the worker loop interval
   * @private
  */
  async _startWorkerLoop() {
    // In test runs, skip background worker loop to avoid dynamic imports/transforms
    if (process.env.NODE_ENV === 'test') {
      this._workerLoopHandle = null;
      return;
    }

    const interval = Math.max(1000, this.config.workerInterval || 5000);
    const { getCronManager } = await import('../../concerns/cron-manager.js');
    const cronManager = getCronManager();

    if (cronManager && !cronManager.disabled) {
      const jobName = `ec-worker-${this.workerId}`;
      await cronManager.scheduleInterval(interval, () => this.workerLoop(), jobName);
      this._workerLoopHandle = { stop: () => cronManager.stop(jobName) };
    } else {
      this._workerLoopHandle = setInterval(() => this.workerLoop(), interval);
    }
  }

  /**
   * Create partition configuration
   * @returns {Object} Partition configuration
   */
  createPartitionConfig() {
    return createPartitionConfig();
  }

  /**
   * Get cohort information for a date
   * @param {Date} date - Date to get cohort info for
   * @returns {Object} Cohort information
   */
  getCohortInfo(date) {
    return getCohortInfo(date, this.config.cohort.timezone, this.config.logLevel);
  }

  /**
   * Create a transaction for a field handler
   * @param {Object} handler - Field handler
   * @param {Object} data - Transaction data
   * @returns {Promise<Object|null>} Created transaction
   */
  async createTransaction(handler, data) {
    return await createTransaction(handler, data, this.config);
  }

  /**
   * Consolidate a single record (internal method)
   * This is used internally by consolidation timers and helper methods
   * @private
   */
  async consolidateRecord(originalId) {
    return await consolidateRecord(
      originalId,
      this.transactionResource,
      this.targetResource,
      this.getStorage(),
      this.analyticsResource,
      (transactions) => this.updateAnalytics(transactions),
      this.config
    );
  }

  /**
   * Get consolidated value without applying (internal method)
   * @private
   */
  async getConsolidatedValue(originalId, options = {}) {
    return await getConsolidatedValue(
      originalId,
      options,
      this.transactionResource,
      this.targetResource,
      this.config
    );
  }

  /**
   * Get cohort statistics
   * @param {string} cohortDate - Cohort date
   * @returns {Promise<Object|null>} Cohort statistics
   */
  async getCohortStats(cohortDate) {
    return await getCohortStats(cohortDate, this.transactionResource);
  }

  /**
   * Recalculate from scratch (internal method)
   * @private
   */
  async recalculateRecord(originalId) {
    return await recalculateRecord(
      originalId,
      this.transactionResource,
      this.targetResource,
      this.getStorage(),
      (id) => this.consolidateRecord(id),
      this.config
    );
  }

  /**
   * Update analytics
   * @private
   */
  async updateAnalytics(transactions) {
    return await updateAnalytics(transactions, this.analyticsResource, this.config);
  }

  /**
   * Helper method for sync mode consolidation
   * @private
   */
  async _syncModeConsolidate(handler, id, field) {
    const oldResource = this.config.resource;
    const oldField = this.config.field;
    const oldTransactionResource = this.transactionResource;
    const oldTargetResource = this.targetResource;
    const oldAnalyticsResource = this.analyticsResource;

    this.config.resource = handler.resource;
    this.config.field = handler.field;
    this.transactionResource = handler.transactionResource;
    this.targetResource = handler.targetResource;
    this.analyticsResource = handler.analyticsResource;

    const result = await this.consolidateRecord(id);

    // Restore
    this.config.resource = oldResource;
    this.config.field = oldField;
    this.transactionResource = oldTransactionResource;
    this.targetResource = oldTargetResource;
    this.analyticsResource = oldAnalyticsResource;

    return result;
  }

  /**
   * Helper method for consolidate with handler
   * @private
   */
  async _consolidateWithHandler(handler, id) {
    const oldResource = this.config.resource;
    const oldField = this.config.field;
    const oldTransactionResource = this.transactionResource;
    const oldTargetResource = this.targetResource;
    const oldAnalyticsResource = this.analyticsResource;

    this.config.resource = handler.resource;
    this.config.field = handler.field;
    this.transactionResource = handler.transactionResource;
    this.targetResource = handler.targetResource;
    this.analyticsResource = handler.analyticsResource;

    const result = await this.consolidateRecord(id);

    this.config.resource = oldResource;
    this.config.field = oldField;
    this.transactionResource = oldTransactionResource;
    this.targetResource = oldTargetResource;
    this.analyticsResource = oldAnalyticsResource;

    return result;
  }

  /**
   * Helper method for getConsolidatedValue with handler
   * @private
   */
  async _getConsolidatedValueWithHandler(handler, id, options) {
    const oldResource = this.config.resource;
    const oldField = this.config.field;
    const oldTransactionResource = this.transactionResource;
    const oldTargetResource = this.targetResource;

    this.config.resource = handler.resource;
    this.config.field = handler.field;
    this.transactionResource = handler.transactionResource;
    this.targetResource = handler.targetResource;

    const result = await this.getConsolidatedValue(id, options);

    this.config.resource = oldResource;
    this.config.field = oldField;
    this.transactionResource = oldTransactionResource;
    this.targetResource = oldTargetResource;

    return result;
  }

  /**
   * Helper method for recalculate with handler
   * @private
   */
  async _recalculateWithHandler(handler, id) {
    const oldResource = this.config.resource;
    const oldField = this.config.field;
    const oldTransactionResource = this.transactionResource;
    const oldTargetResource = this.targetResource;
    const oldAnalyticsResource = this.analyticsResource;

    this.config.resource = handler.resource;
    this.config.field = handler.field;
    this.transactionResource = handler.transactionResource;
    this.targetResource = handler.targetResource;
    this.analyticsResource = handler.analyticsResource;

    const result = await this.recalculateRecord(id);

    this.config.resource = oldResource;
    this.config.field = oldField;
    this.transactionResource = oldTransactionResource;
    this.targetResource = oldTargetResource;
    this.analyticsResource = oldAnalyticsResource;

    return result;
  }

  /**
   * Run consolidation for a handler
   * @private
   */
  async _runConsolidationForHandler(handler, resourceName, fieldName) {
    const oldResource = this.config.resource;
    const oldField = this.config.field;
    const oldTransactionResource = this.transactionResource;
    const oldTargetResource = this.targetResource;
    const oldAnalyticsResource = this.analyticsResource;

    this.config.resource = resourceName;
    this.config.field = fieldName;
    this.transactionResource = handler.transactionResource;
    this.targetResource = handler.targetResource;
    this.analyticsResource = handler.analyticsResource;

    try {
      await runConsolidation(
        this.transactionResource,
        (id) => this.consolidateRecord(id),
        (event, data) => this.emit(event, data),
        this.config
      );
    } finally {
      this.config.resource = oldResource;
      this.config.field = oldField;
      this.transactionResource = oldTransactionResource;
      this.targetResource = oldTargetResource;
      this.analyticsResource = oldAnalyticsResource;
    }
  }

  /**
   * Run garbage collection for a handler
   * @private
   */
  async _runGarbageCollectionForHandler(handler, resourceName, fieldName) {
    const oldResource = this.config.resource;
    const oldField = this.config.field;
    const oldTransactionResource = this.transactionResource;
    const oldTargetResource = this.targetResource;

    this.config.resource = resourceName;
    this.config.field = fieldName;
    this.transactionResource = handler.transactionResource;
    this.targetResource = handler.targetResource;

    try {
      await runGarbageCollection(
        this.transactionResource,
        this.getStorage(),
        this.config,
        (event, data) => this.emit(event, data)
      );
    } finally {
      this.config.resource = oldResource;
      this.config.field = oldField;
      this.transactionResource = oldTransactionResource;
      this.targetResource = oldTargetResource;
    }
  }

  // Public Analytics API

  /**
   * Get analytics for a specific period
   * @param {string} resourceName - Resource name
   * @param {string} field - Field name
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Analytics data
   */
  async getAnalytics(resourceName, field, options = {}) {
    return await getAnalytics(resourceName, field, options, this.fieldHandlers);
  }

  /**
   * Get analytics for entire month, broken down by days
   * @param {string} resourceName - Resource name
   * @param {string} field - Field name
   * @param {string} month - Month in YYYY-MM format
   * @param {Object} options - Options
   * @returns {Promise<Array>} Daily analytics for the month
   */
  async getMonthByDay(resourceName, field, month, options = {}) {
    return await getMonthByDay(resourceName, field, month, options, this.fieldHandlers);
  }

  /**
   * Get analytics for entire day, broken down by hours
   * @param {string} resourceName - Resource name
   * @param {string} field - Field name
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {Object} options - Options
   * @returns {Promise<Array>} Hourly analytics for the day
   */
  async getDayByHour(resourceName, field, date, options = {}) {
    return await getDayByHour(resourceName, field, date, options, this.fieldHandlers);
  }

  /**
   * Get analytics for last N days, broken down by days
   * @param {string} resourceName - Resource name
   * @param {string} field - Field name
   * @param {number} days - Number of days to look back (default: 7)
   * @param {Object} options - Options
   * @returns {Promise<Array>} Daily analytics
   */
  async getLastNDays(resourceName, field, days = 7, options = {}) {
    return await getLastNDays(resourceName, field, days, options, this.fieldHandlers);
  }

  /**
   * Get analytics for entire year, broken down by months
   * @param {string} resourceName - Resource name
   * @param {string} field - Field name
   * @param {number} year - Year (e.g., 2025)
   * @param {Object} options - Options
   * @returns {Promise<Array>} Monthly analytics for the year
   */
  async getYearByMonth(resourceName, field, year, options = {}) {
    return await getYearByMonth(resourceName, field, year, options, this.fieldHandlers);
  }

  /**
   * Get analytics for entire month, broken down by hours
   * @param {string} resourceName - Resource name
   * @param {string} field - Field name
   * @param {string} month - Month in YYYY-MM format (or 'last' for previous month)
   * @param {Object} options - Options
   * @returns {Promise<Array>} Hourly analytics for the month
   */
  async getMonthByHour(resourceName, field, month, options = {}) {
    return await getMonthByHour(resourceName, field, month, options, this.fieldHandlers);
  }

  /**
   * Get analytics for entire year, broken down by weeks
   * @param {string} resourceName - Resource name
   * @param {string} field - Field name
   * @param {number} year - Year (e.g., 2025)
   * @param {Object} options - Options
   * @returns {Promise<Array>} Weekly analytics for the year (up to 53 weeks)
   */
  async getYearByWeek(resourceName, field, year, options = {}) {
    return await getYearByWeek(resourceName, field, year, options, this.fieldHandlers);
  }

  /**
   * Get analytics for entire month, broken down by weeks
   * @param {string} resourceName - Resource name
   * @param {string} field - Field name
   * @param {string} month - Month in YYYY-MM format
   * @param {Object} options - Options
   * @returns {Promise<Array>} Weekly analytics for the month
   */
  async getMonthByWeek(resourceName, field, month, options = {}) {
    return await getMonthByWeek(resourceName, field, month, options, this.fieldHandlers);
  }

  /**
   * Get top records by volume
   * @param {string} resourceName - Resource name
   * @param {string} field - Field name
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Top records
   */
  async getTopRecords(resourceName, field, options = {}) {
    return await getTopRecords(resourceName, field, options, this.fieldHandlers);
  }

  /**
   * Get analytics for entire year, broken down by days
   * @param {string} resourceName - Resource name
   * @param {string} field - Field name
   * @param {number} year - Year (e.g., 2025)
   * @param {Object} options - Options
   * @returns {Promise<Array>} Daily analytics for the year (up to 365/366 records)
   */
  async getYearByDay(resourceName, field, year, options = {}) {
    return await getYearByDay(resourceName, field, year, options, this.fieldHandlers);
  }

  /**
   * Get analytics for entire week, broken down by days
   * @param {string} resourceName - Resource name
   * @param {string} field - Field name
   * @param {string} week - Week in YYYY-Www format (e.g., '2025-W42')
   * @param {Object} options - Options
   * @returns {Promise<Array>} Daily analytics for the week (7 records)
   */
  async getWeekByDay(resourceName, field, week, options = {}) {
    return await getWeekByDay(resourceName, field, week, options, this.fieldHandlers);
  }

  /**
   * Get analytics for entire week, broken down by hours
   * @param {string} resourceName - Resource name
   * @param {string} field - Field name
   * @param {string} week - Week in YYYY-Www format (e.g., '2025-W42')
   * @param {Object} options - Options
   * @returns {Promise<Array>} Hourly analytics for the week (168 records)
   */
  async getWeekByHour(resourceName, field, week, options = {}) {
    return await getWeekByHour(resourceName, field, week, options, this.fieldHandlers);
  }

  /**
   * Get analytics for last N hours
   * @param {string} resourceName - Resource name
   * @param {string} field - Field name
   * @param {number} hours - Number of hours to look back (default: 24)
   * @param {Object} options - Options
   * @returns {Promise<Array>} Hourly analytics
   */
  async getLastNHours(resourceName, field, hours = 24, options = {}) {
    return await getLastNHours(resourceName, field, hours, options, this.fieldHandlers);
  }

  /**
   * Get analytics for last N weeks
   * @param {string} resourceName - Resource name
   * @param {string} field - Field name
   * @param {number} weeks - Number of weeks to look back (default: 4)
   * @param {Object} options - Options
   * @returns {Promise<Array>} Weekly analytics
   */
  async getLastNWeeks(resourceName, field, weeks = 4, options = {}) {
    return await getLastNWeeks(resourceName, field, weeks, options, this.fieldHandlers);
  }

  /**
   * Get analytics for last N months
   * @param {string} resourceName - Resource name
   * @param {string} field - Field name
   * @param {number} months - Number of months to look back (default: 12)
   * @param {Object} options - Options
   * @returns {Promise<Array>} Monthly analytics
   */
  async getLastNMonths(resourceName, field, months = 12, options = {}) {
    return await getLastNMonths(resourceName, field, months, options, this.fieldHandlers);
  }

  /**
   * Get raw transaction events for custom aggregation
   *
   * This method provides direct access to the underlying transaction events,
   * allowing developers to perform custom aggregations beyond the pre-built analytics.
   * Useful for complex queries, custom metrics, or when you need the raw event data.
   *
   * @param {string} resourceName - Resource name
   * @param {string} field - Field name
   * @param {Object} options - Query options
   * @param {string} options.recordId - Filter by specific record ID
   * @param {string} options.startDate - Start date filter (YYYY-MM-DD or YYYY-MM-DDTHH)
   * @param {string} options.endDate - End date filter (YYYY-MM-DD or YYYY-MM-DDTHH)
   * @param {string} options.cohortDate - Filter by cohort date (YYYY-MM-DD)
   * @param {string} options.cohortHour - Filter by cohort hour (YYYY-MM-DDTHH)
   * @param {string} options.cohortMonth - Filter by cohort month (YYYY-MM)
   * @param {boolean} options.applied - Filter by applied status (true/false/undefined for both)
   * @param {string} options.operation - Filter by operation type ('add', 'sub', 'set')
   * @param {number} options.limit - Maximum number of events to return
   * @returns {Promise<Array>} Raw transaction events
   *
   * @example
   * // Get all events for a specific record
   * const events = await plugin.getRawEvents('wallets', 'balance', {
   *   recordId: 'wallet1'
   * });
   *
   * @example
   * // Get events for a specific time range
   * const events = await plugin.getRawEvents('wallets', 'balance', {
   *   startDate: '2025-10-01',
   *   endDate: '2025-10-31'
   * });
   *
   * @example
   * // Get only pending (unapplied) transactions
   * const pending = await plugin.getRawEvents('wallets', 'balance', {
   *   applied: false
   * });
   */
  async getRawEvents(resourceName, field, options = {}) {
    return await getRawEvents(resourceName, field, options, this.fieldHandlers);
  }

  /**
   * Get diagnostics information about the plugin state
   *
   * This method provides comprehensive diagnostic information about the EventualConsistencyPlugin,
   * including configured resources, field handlers, timers, and overall health status.
   * Useful for debugging initialization issues, configuration problems, or runtime errors.
   *
   * @param {Object} options - Diagnostic options
   * @param {string} options.resourceName - Optional: limit diagnostics to specific resource
   * @param {string} options.field - Optional: limit diagnostics to specific field
   * @param {boolean} options.includeStats - Include transaction statistics (default: false)
   * @returns {Promise<Object>} Diagnostic information
   *
   * @example
   * // Get overall plugin diagnostics
   * const diagnostics = await plugin.getDiagnostics();
   * this.logger.info(diagnostics);
   *
   * @example
   * // Get diagnostics for specific resource/field with stats
   * const diagnostics = await plugin.getDiagnostics({
   *   resourceName: 'wallets',
   *   field: 'balance',
   *   includeStats: true
   * });
   */
  async getDiagnostics(options = {}) {
    const { resourceName, field, includeStats = false } = options;

    const diagnostics = {
      plugin: {
        name: 'EventualConsistencyPlugin',
        initialized: this.database !== null && this.database !== undefined,
        logLevel: this.config.logLevel || 'info',
        timezone: this.config.cohort?.timezone || 'UTC',
        consolidation: {
          mode: this.config.consolidation?.mode || 'timer',
          interval: this.config.consolidation?.interval || 60000,
          batchSize: this.config.consolidation?.batchSize || 100
        },
        garbageCollection: {
          enabled: this.config.garbageCollection?.enabled !== false,
          retentionDays: this.config.garbageCollection?.retentionDays || 30,
          interval: this.config.garbageCollection?.interval || 3600000
        }
      },
      resources: [],
      errors: [],
      warnings: []
    };

    // Iterate through configured resources
    for (const [resName, resourceHandlers] of this.fieldHandlers.entries()) {
      // Skip if filtering by resource and this isn't it
      if (resourceName && resName !== resourceName) {
        continue;
      }

      const resourceDiag = {
        name: resName,
        fields: []
      };

      for (const [fieldName, handler] of resourceHandlers.entries()) {
        // Skip if filtering by field and this isn't it
        if (field && fieldName !== field) {
          continue;
        }

        const fieldDiag = {
          name: fieldName,
          type: handler.type || 'counter',
          analyticsEnabled: handler.analyticsResource !== null && handler.analyticsResource !== undefined,
          resources: {
            transaction: handler.transactionResource?.name || null,
            target: handler.targetResource?.name || null,
            analytics: handler.analyticsResource?.name || null
          },
          timers: {
            consolidation: handler.consolidationTimer !== null && handler.consolidationTimer !== undefined,
            garbageCollection: handler.garbageCollectionTimer !== null && handler.garbageCollectionTimer !== undefined
          }
        };

        // Check for common issues
        if (!handler.transactionResource) {
          diagnostics.errors.push({
            resource: resName,
            field: fieldName,
            issue: 'Missing transaction resource',
            suggestion: 'Ensure plugin is installed and resources are created after plugin installation'
          });
        }

        if (!handler.targetResource) {
          diagnostics.warnings.push({
            resource: resName,
            field: fieldName,
            issue: 'Missing target resource',
            suggestion: 'Target resource may not have been created yet'
          });
        }

        if (handler.analyticsResource && !handler.analyticsResource.name) {
          diagnostics.errors.push({
            resource: resName,
            field: fieldName,
            issue: 'Invalid analytics resource',
            suggestion: 'Analytics resource exists but has no name - possible initialization failure'
          });
        }

        // Include statistics if requested
        if (includeStats && handler.transactionResource) {
          try {
            const [okPending, errPending, pendingTxns] = await handler.transactionResource.query({ applied: false }).catch(() => [false, null, []]);
            const [okApplied, errApplied, appliedTxns] = await handler.transactionResource.query({ applied: true }).catch(() => [false, null, []]);

            fieldDiag.stats = {
              pendingTransactions: okPending ? (pendingTxns?.length || 0) : 'error',
              appliedTransactions: okApplied ? (appliedTxns?.length || 0) : 'error',
              totalTransactions: (okPending && okApplied) ? ((pendingTxns?.length || 0) + (appliedTxns?.length || 0)) : 'error'
            };

            if (handler.analyticsResource) {
              const [okAnalytics, errAnalytics, analyticsRecords] = await handler.analyticsResource.list().catch(() => [false, null, []]);
              fieldDiag.stats.analyticsRecords = okAnalytics ? (analyticsRecords?.length || 0) : 'error';
            }
          } catch (error) {
            diagnostics.warnings.push({
              resource: resName,
              field: fieldName,
              issue: 'Failed to fetch statistics',
              error: error.message
            });
          }
        }

        resourceDiag.fields.push(fieldDiag);
      }

      if (resourceDiag.fields.length > 0) {
        diagnostics.resources.push(resourceDiag);
      }
    }

    // Overall health check
    diagnostics.health = {
      status: diagnostics.errors.length === 0 ? (diagnostics.warnings.length === 0 ? 'healthy' : 'warning') : 'error',
      totalResources: diagnostics.resources.length,
      totalFields: diagnostics.resources.reduce((sum, r) => sum + r.fields.length, 0),
      errorCount: diagnostics.errors.length,
      warningCount: diagnostics.warnings.length
    };

    return diagnostics;
  }

  // ==================== COORDINATOR HOOKS ====================
  // These methods are called by CoordinatorPlugin

  /**
   * Called when this worker becomes the coordinator
   * @override
   */
  async onBecomeCoordinator() {
    this.logger.debug(
      { workerId: this.workerId },
      'Global coordinator elected this worker as leader'
    );

    // Emit event for monitoring
    this.database.emit('plg:eventual-consistency:coordinator-promoted', {
      pluginName: this.name,
      workerId: this.workerId,
      timestamp: Date.now()
    });
  }

  /**
   * Called when this worker stops being the coordinator
   * @override
   */
  async onStopBeingCoordinator() {
    this.logger.debug(
      { workerId: this.workerId },
      'Global coordinator demoted this worker from leader'
    );

    // Emit event for monitoring
    this.database.emit('plg:eventual-consistency:coordinator-demoted', {
      pluginName: this.name,
      workerId: this.workerId,
      timestamp: Date.now()
    });
  }

  /**
   * Get cohort hours for the consolidation window
   * @private
   */
  _getCohortHours(windowHours) {
    const cohortHours = [];
    const now = new Date();

    for (let i = 0; i < windowHours; i++) {
      const hourDate = new Date(now.getTime() - (i * 60 * 60 * 1000));
      const cohortHour = hourDate.toISOString().slice(0, 13) + ':00:00Z';
      cohortHours.push(cohortHour);
    }

    return cohortHours;
  }

  /**
   * Periodic work that only the coordinator should do
   * Creates tickets from pending transactions for all field handlers
   * @override
   */
  async coordinatorWork() {
    if (!this.config.enableCoordinator) {
      return; // Coordinator mode disabled
    }

    if (this.config.logLevel) {
      this.logger.info(`[EventualConsistency] Coordinator work executing (workerId: ${this.workerId})`);
    }

    // Iterate over all field handlers and create tickets
    let totalTickets = 0;
    const results = [];

    for (const [resourceName, fieldHandlers] of this.fieldHandlers.entries()) {
      for (const [fieldName, handler] of fieldHandlers.entries()) {
        try {
          // Create tickets for this handler
          const tickets = await createTicketsForHandler(
            handler,
            this.config,
            (windowHours) => this._getCohortHours(windowHours)
          );

          // Run garbage collection (coordinator responsibility now)
          await this._runGarbageCollectionForHandler(handler, resourceName, fieldName);

          totalTickets += tickets.length;
          results.push({
            resource: resourceName,
            field: fieldName,
            tickets: tickets.length
          });

          if (this.config.logLevel && tickets.length > 0) {
            this.logger.info(`[EventualConsistency] Created ${tickets.length} tickets for ${resourceName}.${fieldName}`);
          }
        } catch (err) {
          if (this.config.logLevel) {
            this.logger.error(`[EventualConsistency] Error creating tickets for ${resourceName}.${fieldName}:`, err);
          }
        }
      }
    }

    if (this.config.logLevel) {
      this.logger.info(`[EventualConsistency] Coordinator work complete: ${totalTickets} total tickets created`);
    }

    // Emit event for monitoring
    this.database.emit('plg:eventual-consistency:tickets-created', {
      pluginName: this.name,
      workerId: this.workerId,
      totalTickets,
      results,
      timestamp: Date.now()
    });
  }

  /**
   * Worker loop - runs on all workers (including coordinator)
   * Claims and processes available tickets
   */
  async workerLoop() {
    if (!this.config.enableCoordinator) {
      return; // Coordinator mode disabled
    }

    if (this.config.logLevel === 'debug') {
      this.logger.debug(`[EventualConsistency] Worker loop executing (workerId: ${this.workerId})`);
    }

    // Flatten handlers for concurrent processing
    const tasks = [];
    for (const [resourceName, fieldHandlers] of this.fieldHandlers.entries()) {
      for (const [fieldName, handler] of fieldHandlers.entries()) {
        tasks.push({ resourceName, fieldName, handler });
      }
    }

    // Process all handlers concurrently
    // S3Client's TasksPool will manage the concurrency limit (default 10)
    const taskResults = await Promise.all(tasks.map(task => this._processHandlerWork(task)));

    // Aggregate results
    let totalClaimed = 0;
    let totalProcessed = 0;
    let totalErrors = 0;
    const results = [];

    for (const res of taskResults) {
      if (!res) continue;
      totalClaimed += res.claimed;
      totalProcessed += res.processed;
      totalErrors += res.errors;
      if (res.details) results.push(...res.details);
    }

    if (this.config.logLevel && (totalClaimed > 0 || totalErrors > 0)) {
      this.logger.info(`[EventualConsistency] Worker loop complete: claimed ${totalClaimed} tickets, processed ${totalProcessed} records, ${totalErrors} errors`);
    }

    // Emit event for monitoring (only if meaningful activity)
    if (totalClaimed > 0 || totalErrors > 0) {
      this.database.emit('plg:eventual-consistency:tickets-processed', {
        pluginName: this.name,
        workerId: this.workerId,
        ticketsClaimed: totalClaimed,
        recordsProcessed: totalProcessed,
        errors: totalErrors,
        results,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Process work for a single handler (claim & process tickets)
   * @private
   */
  async _processHandlerWork({ resourceName, fieldName, handler }) {
    const now = Date.now();
    
    // Adaptive Backoff Settings
    const MIN_INTERVAL = 10000; // 10s (fast polling when active)
    const MAX_INTERVAL = 60000; // 1m (slow polling when idle)
    const BASE_INTERVAL = this.config.workerInterval || 10000;

    // Initialize backoff state if missing
    if (!handler._backoffState) {
      // Jitter the first check to spread load over the base interval
      // This prevents all 14+ queues from being checked simultaneously on startup
      const initialDelay = Math.floor(Math.random() * BASE_INTERVAL);
      handler._backoffState = {
        nextCheck: now + initialDelay,
        multiplier: 1
      };
      // Skip first run to respect jitter
      return null;
    }

    // Skip if backoff active
    if (now < handler._backoffState.nextCheck) {
      return null;
    }

    const result = { claimed: 0, processed: 0, errors: 0, details: [] };

    try {
      // Attempt to claim tickets
      const claimed = await claimTickets(
        handler.ticketResource,
        this.workerId,
        this.config
      );

      if (claimed.length === 0) {
        // No tickets: Increase backoff
        let newInterval;
        
        if (handler._backoffState.multiplier < 1) {
           // Was fast polling, but queue empty now. Reset to base.
           handler._backoffState.multiplier = 1;
           newInterval = BASE_INTERVAL;
        } else {
           // Was normal/slow polling, still empty. Backoff further.
           handler._backoffState.multiplier = Math.min(10, handler._backoffState.multiplier * 1.5);
           newInterval = Math.min(MAX_INTERVAL, BASE_INTERVAL * handler._backoffState.multiplier);
        }

        handler._backoffState.nextCheck = now + newInterval;
        return null;
      }

      // Tickets found: Reset to fast polling to drain queue
      handler._backoffState.multiplier = 0.2; 
      handler._backoffState.nextCheck = now + MIN_INTERVAL;

      result.claimed = claimed.length;

      if (this.config.logLevel) {
        this.logger.info(`[EventualConsistency] Claimed ${claimed.length} tickets for ${resourceName}.${fieldName}`);
      }

      // Process each claimed ticket
      // We process tickets sequentially per handler to avoid race conditions on the same data
      for (const ticket of claimed) {
        try {
          const ticketResult = await processTicket(ticket, handler, this.database);

          result.processed += ticketResult.recordsProcessed;
          result.errors += ticketResult.errors.length;

          result.details.push({
            resource: resourceName,
            field: fieldName,
            ticketId: ticket.id,
            recordsProcessed: ticketResult.recordsProcessed,
            transactionsApplied: ticketResult.transactionsApplied,
            errors: ticketResult.errors
          });

          if (this.config.logLevel && ticketResult.recordsProcessed > 0) {
            this.logger.info(`[EventualConsistency] Processed ticket ${ticket.id}: ${ticketResult.recordsProcessed} records, ${ticketResult.transactionsApplied} transactions`);
          }

          if (this.config.logLevel && ticketResult.errors.length > 0) {
            this.logger.error(`[EventualConsistency] Errors processing ticket ${ticket.id}:`, ticketResult.errors);
          }
        } catch (err) {
          result.errors++;
          if (this.config.logLevel) {
            this.logger.error(`[EventualConsistency] Failed to process ticket ${ticket.id}:`, err);
          }
          result.details.push({
            resource: resourceName,
            field: fieldName,
            ticketId: ticket.id,
            recordsProcessed: 0,
            transactionsApplied: 0,
            errors: [{ error: err.message }]
          });
        }
      }
    } catch (err) {
      if (this.config.logLevel) {
        this.logger.error(`[EventualConsistency] Error in worker loop for ${resourceName}.${fieldName}:`, err);
      }
    }

    return result;
  }
}
