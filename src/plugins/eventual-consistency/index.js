/**
 * EventualConsistencyPlugin - Main export
 * Provides eventually consistent counters using transaction log pattern
 * @module eventual-consistency
 */

import Plugin from "../plugin.class.js";
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
import { updateAnalytics, getAnalytics, getMonthByDay, getDayByHour, getLastNDays, getYearByMonth, getMonthByHour, getTopRecords } from "./analytics.js";
import { onInstall, onStart, onStop, watchForResource, completeFieldSetup } from "./install.js";

export class EventualConsistencyPlugin extends Plugin {
  constructor(options = {}) {
    super(options);

    // Validate resources structure
    validateResourcesConfig(options.resources);

    // Auto-detect timezone
    const detectedTimezone = detectTimezone();
    const timezoneAutoDetected = !options.cohort?.timezone;

    // Create shared configuration
    this.config = createConfig(options, detectedTimezone);

    // Create field handlers map
    this.fieldHandlers = new Map(); // Map<resourceName, Map<fieldName, handler>>

    // Parse resources configuration
    for (const [resourceName, fields] of Object.entries(options.resources)) {
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

  /**
   * Install hook - create resources and register helpers
   */
  async onInstall() {
    await onInstall(
      this.database,
      this.fieldHandlers,
      (handler) => completeFieldSetup(handler, this.database, this.config, this),
      (resourceName) => watchForResource(resourceName, this.database, this.fieldHandlers,
        (handler) => completeFieldSetup(handler, this.database, this.config, this))
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
  }

  /**
   * Stop hook - stop timers and flush pending
   */
  async onStop() {
    await onStop(
      this.fieldHandlers,
      (event, data) => this.emit(event, data)
    );
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
    return getCohortInfo(date, this.config.cohort.timezone, this.config.verbose);
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
      this.lockResource,
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
      this.lockResource,
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
    // Temporarily set config for legacy methods
    const oldResource = this.config.resource;
    const oldField = this.config.field;
    const oldTransactionResource = this.transactionResource;
    const oldTargetResource = this.targetResource;
    const oldLockResource = this.lockResource;
    const oldAnalyticsResource = this.analyticsResource;

    this.config.resource = handler.resource;
    this.config.field = handler.field;
    this.transactionResource = handler.transactionResource;
    this.targetResource = handler.targetResource;
    this.lockResource = handler.lockResource;
    this.analyticsResource = handler.analyticsResource;

    const result = await this.consolidateRecord(id);

    // Restore
    this.config.resource = oldResource;
    this.config.field = oldField;
    this.transactionResource = oldTransactionResource;
    this.targetResource = oldTargetResource;
    this.lockResource = oldLockResource;
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
    const oldLockResource = this.lockResource;
    const oldAnalyticsResource = this.analyticsResource;

    this.config.resource = handler.resource;
    this.config.field = handler.field;
    this.transactionResource = handler.transactionResource;
    this.targetResource = handler.targetResource;
    this.lockResource = handler.lockResource;
    this.analyticsResource = handler.analyticsResource;

    const result = await this.consolidateRecord(id);

    this.config.resource = oldResource;
    this.config.field = oldField;
    this.transactionResource = oldTransactionResource;
    this.targetResource = oldTargetResource;
    this.lockResource = oldLockResource;
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
    const oldLockResource = this.lockResource;
    const oldAnalyticsResource = this.analyticsResource;

    this.config.resource = handler.resource;
    this.config.field = handler.field;
    this.transactionResource = handler.transactionResource;
    this.targetResource = handler.targetResource;
    this.lockResource = handler.lockResource;
    this.analyticsResource = handler.analyticsResource;

    const result = await this.recalculateRecord(id);

    this.config.resource = oldResource;
    this.config.field = oldField;
    this.transactionResource = oldTransactionResource;
    this.targetResource = oldTargetResource;
    this.lockResource = oldLockResource;
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
    const oldLockResource = this.lockResource;
    const oldAnalyticsResource = this.analyticsResource;

    this.config.resource = resourceName;
    this.config.field = fieldName;
    this.transactionResource = handler.transactionResource;
    this.targetResource = handler.targetResource;
    this.lockResource = handler.lockResource;
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
      this.lockResource = oldLockResource;
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
    const oldLockResource = this.lockResource;

    this.config.resource = resourceName;
    this.config.field = fieldName;
    this.transactionResource = handler.transactionResource;
    this.targetResource = handler.targetResource;
    this.lockResource = handler.lockResource;

    try {
      await runGarbageCollection(
        this.transactionResource,
        this.lockResource,
        this.config,
        (event, data) => this.emit(event, data)
      );
    } finally {
      this.config.resource = oldResource;
      this.config.field = oldField;
      this.transactionResource = oldTransactionResource;
      this.targetResource = oldTargetResource;
      this.lockResource = oldLockResource;
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
   * Get top records by volume
   * @param {string} resourceName - Resource name
   * @param {string} field - Field name
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Top records
   */
  async getTopRecords(resourceName, field, options = {}) {
    return await getTopRecords(resourceName, field, options, this.fieldHandlers);
  }
}

export default EventualConsistencyPlugin;
