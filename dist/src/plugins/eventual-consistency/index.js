/**
 * EventualConsistencyPlugin - Eventually consistent counters and aggregations
 * @module eventual-consistency
 */
import { CoordinatorPlugin } from '../concerns/coordinator-plugin.class.js';
import { PluginStorage } from '../../concerns/plugin-storage.js';
import { createLogger } from '../../concerns/logger.js';
import { createConfig, validateResourcesConfig, logConfigWarnings, logInitialization } from './config.js';
import { createFieldHandler, getCohortHoursWindow } from './utils.js';
import { onInstall, onStart, onStop, watchForResource, completeFieldSetup } from './install.js';
import { runConsolidation, getConsolidatedValue, getCohortStats, recalculateRecord } from './consolidation.js';
import { runGarbageCollection } from './garbage-collection.js';
import { cleanupStaleLocks } from './locks.js';
import { createTicketsForHandler, claimTickets, processTicket } from './tickets.js';
import { getAnalytics, getMonthByDay, getDayByHour, getLastNDays, getYearByMonth, getYearByWeek, getMonthByWeek, getMonthByHour, getTopRecords, getYearByDay, getWeekByDay, getWeekByHour, getLastNHours, getLastNWeeks, getLastNMonths, getRawEvents, fillGaps } from './analytics.js';
const logger = createLogger({ name: 'eventual-consistency' });
export class EventualConsistencyPlugin extends CoordinatorPlugin {
    fieldHandlers = new Map();
    storage;
    constructor(options = {}) {
        const config = createConfig(options);
        super({
            name: 'EventualConsistencyPlugin',
            version: '1.0.0',
            ...options
        });
        this.config = config;
        this.workerId = `worker-${process.pid}-${Date.now()}`;
        if (config.resources && config.resources.length > 0) {
            validateResourcesConfig(config.resources);
            this._initializeFieldHandlers(config.resources);
        }
        logConfigWarnings(config);
    }
    /**
     * Initialize field handlers from configuration
     */
    _initializeFieldHandlers(resources) {
        for (const resourceConfig of resources) {
            const resourceName = resourceConfig.resource;
            const resourceHandlers = new Map();
            for (const fieldConfig of resourceConfig.fields) {
                const handler = createFieldHandler(resourceName, fieldConfig, this.config);
                resourceHandlers.set(handler.field, handler);
            }
            this.fieldHandlers.set(resourceName, resourceHandlers);
        }
    }
    /**
     * Plugin installation hook
     */
    async onInstall() {
        this.storage = new PluginStorage(this.database, 'eventual-consistency');
        await onInstall(this.database, this.fieldHandlers, (handler) => this._completeFieldSetup(handler), (resourceName) => this._watchForResource(resourceName), (resourceName) => this._shouldManageResource(resourceName));
        logInitialization(this.config);
    }
    /**
     * Plugin start hook
     */
    async onStart() {
        await onStart(this.fieldHandlers, this.config, (handler, resourceName, fieldName) => this.runConsolidation(handler, resourceName, fieldName), (handler, resourceName, fieldName) => this._runGC(handler, resourceName, fieldName), (event, data) => this._emit(event, data));
        if (this.config.enableCoordinator) {
            await this._startCoordinator();
        }
    }
    /**
     * Plugin stop hook
     */
    async onStop() {
        await onStop(this.fieldHandlers, (event, data) => this._emit(event, data));
        if (this.config.enableCoordinator) {
            await this._stopCoordinator();
        }
    }
    /**
     * Complete field setup for a handler
     */
    async _completeFieldSetup(handler) {
        await completeFieldSetup(handler, this.database, this.config, this);
    }
    /**
     * Watch for resource creation
     */
    _watchForResource(resourceName) {
        watchForResource(resourceName, this.database, this.fieldHandlers, (handler) => this._completeFieldSetup(handler));
    }
    /**
     * Check if resource should be managed
     */
    _shouldManageResource(resourceName) {
        return true;
    }
    /**
     * Emit an event
     */
    _emit(event, data) {
        if (this.database.emit) {
            this.database.emit(event, data);
        }
    }
    /**
     * Run consolidation for a field handler
     */
    async runConsolidation(handler, resourceName, fieldName) {
        return runConsolidation(handler, this.storage, this.config, (event, data) => this._emit(event, data));
    }
    /**
     * Run garbage collection for a field handler
     */
    async _runGC(handler, resourceName, fieldName) {
        await runGarbageCollection(handler.transactionResource, this.storage, {
            resource: resourceName,
            field: fieldName,
            transactionRetention: this.config.transactionRetention,
            logLevel: this.config.logLevel
        }, (event, data) => this._emit(event, data));
    }
    /**
     * Get consolidated value for a record
     */
    async getConsolidatedValue(resourceName, fieldName, recordId) {
        const handler = this._getHandler(resourceName, fieldName);
        return getConsolidatedValue(handler, recordId);
    }
    /**
     * Get cohort statistics
     */
    async getCohortStats(resourceName, fieldName) {
        const handler = this._getHandler(resourceName, fieldName);
        return getCohortStats(handler, this.config);
    }
    /**
     * Recalculate a record's value
     */
    async recalculateRecord(resourceName, fieldName, recordId) {
        const handler = this._getHandler(resourceName, fieldName);
        return recalculateRecord(handler, recordId);
    }
    /**
     * Get a field handler
     */
    _getHandler(resourceName, fieldName) {
        const resourceHandlers = this.fieldHandlers.get(resourceName);
        if (!resourceHandlers) {
            throw new Error(`No handlers for resource: ${resourceName}`);
        }
        const handler = resourceHandlers.get(fieldName);
        if (!handler) {
            throw new Error(`No handler for field: ${resourceName}.${fieldName}`);
        }
        return handler;
    }
    // ============================================
    // Coordinator Mode
    // ============================================
    /**
     * Start coordinator mode
     */
    async _startCoordinator() {
        await super.onStart();
    }
    /**
     * Stop coordinator mode
     */
    async _stopCoordinator() {
        await super.onStop();
    }
    /**
     * Coordinator work (runs only on leader)
     */
    async doCoordinatorWork() {
        for (const [resourceName, resourceHandlers] of this.fieldHandlers) {
            for (const [fieldName, handler] of resourceHandlers) {
                await createTicketsForHandler(handler, this.config, (windowHours) => getCohortHoursWindow(windowHours, this.config.cohort.timezone));
            }
        }
        await cleanupStaleLocks(this.storage, this.config);
    }
    /**
     * Worker work (runs on all instances)
     */
    async doWorkerWork() {
        for (const [resourceName, resourceHandlers] of this.fieldHandlers) {
            for (const [fieldName, handler] of resourceHandlers) {
                if (!handler.ticketResource)
                    continue;
                const tickets = await claimTickets(handler.ticketResource, this.workerId, this.config);
                for (const ticket of tickets) {
                    await processTicket(ticket, handler, this.database);
                }
            }
        }
    }
    // ============================================
    // Analytics API
    // ============================================
    /**
     * Get analytics for a field
     */
    async getAnalytics(resourceName, fieldName, options = {}) {
        return getAnalytics(resourceName, fieldName, options, this.fieldHandlers);
    }
    /**
     * Get month analytics broken down by day
     */
    async getMonthByDay(resourceName, fieldName, month, options = {}) {
        return getMonthByDay(resourceName, fieldName, month, options, this.fieldHandlers);
    }
    /**
     * Get day analytics broken down by hour
     */
    async getDayByHour(resourceName, fieldName, date, options = {}) {
        return getDayByHour(resourceName, fieldName, date, options, this.fieldHandlers);
    }
    /**
     * Get last N days analytics
     */
    async getLastNDays(resourceName, fieldName, days = 7, options = {}) {
        return getLastNDays(resourceName, fieldName, days, options, this.fieldHandlers);
    }
    /**
     * Get year analytics broken down by month
     */
    async getYearByMonth(resourceName, fieldName, year, options = {}) {
        return getYearByMonth(resourceName, fieldName, year, options, this.fieldHandlers);
    }
    /**
     * Get year analytics broken down by week
     */
    async getYearByWeek(resourceName, fieldName, year, options = {}) {
        return getYearByWeek(resourceName, fieldName, year, options, this.fieldHandlers);
    }
    /**
     * Get month analytics broken down by week
     */
    async getMonthByWeek(resourceName, fieldName, month, options = {}) {
        return getMonthByWeek(resourceName, fieldName, month, options, this.fieldHandlers);
    }
    /**
     * Get month analytics broken down by hour
     */
    async getMonthByHour(resourceName, fieldName, month, options = {}) {
        return getMonthByHour(resourceName, fieldName, month, options, this.fieldHandlers);
    }
    /**
     * Get top records by activity
     */
    async getTopRecords(resourceName, fieldName, options = {}) {
        return getTopRecords(resourceName, fieldName, options, this.fieldHandlers);
    }
    /**
     * Get year analytics broken down by day
     */
    async getYearByDay(resourceName, fieldName, year, options = {}) {
        return getYearByDay(resourceName, fieldName, year, options, this.fieldHandlers);
    }
    /**
     * Get week analytics broken down by day
     */
    async getWeekByDay(resourceName, fieldName, week, options = {}) {
        return getWeekByDay(resourceName, fieldName, week, options, this.fieldHandlers);
    }
    /**
     * Get week analytics broken down by hour
     */
    async getWeekByHour(resourceName, fieldName, week, options = {}) {
        return getWeekByHour(resourceName, fieldName, week, options, this.fieldHandlers);
    }
    /**
     * Get last N hours analytics
     */
    async getLastNHours(resourceName, fieldName, hours = 24, options = {}) {
        return getLastNHours(resourceName, fieldName, hours, options, this.fieldHandlers);
    }
    /**
     * Get last N weeks analytics
     */
    async getLastNWeeks(resourceName, fieldName, weeks = 4, options = {}) {
        return getLastNWeeks(resourceName, fieldName, weeks, options, this.fieldHandlers);
    }
    /**
     * Get last N months analytics
     */
    async getLastNMonths(resourceName, fieldName, months = 12, options = {}) {
        return getLastNMonths(resourceName, fieldName, months, options, this.fieldHandlers);
    }
    /**
     * Get raw transaction events
     */
    async getRawEvents(resourceName, fieldName, options = {}) {
        return getRawEvents(resourceName, fieldName, options, this.fieldHandlers);
    }
    /**
     * Fill gaps in analytics data
     */
    fillGaps(data, period, startDate, endDate) {
        return fillGaps(data, period, startDate, endDate);
    }
    /**
     * Force consolidation for all handlers
     */
    async consolidateAll() {
        const results = new Map();
        for (const [resourceName, resourceHandlers] of this.fieldHandlers) {
            for (const [fieldName, handler] of resourceHandlers) {
                const key = `${resourceName}.${fieldName}`;
                const result = await this.runConsolidation(handler, resourceName, fieldName);
                results.set(key, result);
            }
        }
        return results;
    }
    /**
     * Get plugin status
     */
    getStatus() {
        const handlers = {};
        for (const [resourceName, resourceHandlers] of this.fieldHandlers) {
            handlers[resourceName] = Array.from(resourceHandlers.keys());
        }
        return {
            name: 'EventualConsistencyPlugin',
            version: '1.0.0',
            mode: this.config.mode,
            enableCoordinator: this.config.enableCoordinator,
            enableAnalytics: this.config.enableAnalytics,
            consolidationInterval: this.config.consolidationInterval,
            handlers,
            workerId: this.workerId
        };
    }
}
export default EventualConsistencyPlugin;
//# sourceMappingURL=index.js.map