/**
 * EventualConsistencyPlugin - Eventually consistent counters and aggregations
 * @module eventual-consistency
 */

import { CoordinatorPlugin } from '../concerns/coordinator-plugin.class.js';
import { PluginStorage } from '../../concerns/plugin-storage.js';
import { createLogger } from '../../concerns/logger.js';
import tryFn from '../../concerns/try-fn.js';

import {
  createConfig,
  validateResourcesConfig,
  logConfigWarnings,
  logInitialization,
  type EventualConsistencyPluginOptions,
  type NormalizedConfig,
  type ResourceConfig
} from './config.js';

import {
  createFieldHandler,
  getCohortHoursWindow,
  type FieldHandler
} from './utils.js';

import {
  onInstall,
  onStart,
  onStop,
  watchForResource,
  completeFieldSetup,
  type FieldHandlers
} from './install.js';

import {
  runConsolidation,
  getConsolidatedValue,
  getCohortStats,
  recalculateRecord,
  type ConsolidationResult,
  type CohortStats
} from './consolidation.js';

import { runGarbageCollection } from './garbage-collection.js';
import { cleanupStaleLocks, type PluginStorage as IPluginStorage } from './locks.js';

import {
  createTicketsForHandler,
  claimTickets,
  processTicket,
  type Ticket,
  type ProcessTicketResults
} from './tickets.js';

import {
  getAnalytics,
  getMonthByDay,
  getDayByHour,
  getLastNDays,
  getYearByMonth,
  getYearByWeek,
  getMonthByWeek,
  getMonthByHour,
  getTopRecords,
  getYearByDay,
  getWeekByDay,
  getWeekByHour,
  getLastNHours,
  getLastNWeeks,
  getLastNMonths,
  getRawEvents,
  fillGaps,
  type GetAnalyticsOptions,
  type GetTopRecordsOptions,
  type GetRawEventsOptions,
  type AnalyticsDataPoint,
  type TopRecord
} from './analytics.js';

const logger = createLogger({ name: 'eventual-consistency' });

export interface Database {
  resources: Record<string, any>;
  createResource(config: any): Promise<any>;
  addHook(hookName: string, callback: any): void;
  emit?(event: string, data: any): void;
}

export interface CoordinatorConfig {
  namespace?: string;
  heartbeatInterval?: number;
  leaderTTL?: number;
}

export class EventualConsistencyPlugin extends CoordinatorPlugin<EventualConsistencyPluginOptions> {
  declare config: NormalizedConfig;
  private fieldHandlers: FieldHandlers = new Map();
  private storage!: PluginStorage;
  declare workerId: string;

  constructor(options: EventualConsistencyPluginOptions = {}) {
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
  private _initializeFieldHandlers(resources: ResourceConfig[]): void {
    for (const resourceConfig of resources) {
      const resourceName = resourceConfig.resource;
      const resourceHandlers = new Map<string, FieldHandler>();

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
  override async onInstall(): Promise<void> {
    this.storage = new PluginStorage(this.database as any, 'eventual-consistency');

    await onInstall(
      this.database as any,
      this.fieldHandlers,
      (handler) => this._completeFieldSetup(handler),
      (resourceName) => this._watchForResource(resourceName),
      (resourceName) => this._shouldManageResource(resourceName)
    );

    logInitialization(this.config);
  }

  /**
   * Plugin start hook
   */
  override async onStart(): Promise<void> {
    await onStart(
      this.fieldHandlers,
      this.config,
      (handler, resourceName, fieldName) => this.runConsolidation(handler, resourceName, fieldName),
      (handler, resourceName, fieldName) => this._runGC(handler, resourceName, fieldName),
      (event, data) => this._emit(event, data)
    );

    if (this.config.enableCoordinator) {
      await this._startCoordinator();
    }
  }

  /**
   * Plugin stop hook
   */
  override async onStop(): Promise<void> {
    await onStop(
      this.fieldHandlers,
      (event, data) => this._emit(event, data)
    );

    if (this.config.enableCoordinator) {
      await this._stopCoordinator();
    }
  }

  /**
   * Complete field setup for a handler
   */
  private async _completeFieldSetup(handler: FieldHandler): Promise<void> {
    await completeFieldSetup(handler, this.database as any, this.config, this);
  }

  /**
   * Watch for resource creation
   */
  private _watchForResource(resourceName: string): void {
    watchForResource(
      resourceName,
      this.database as any,
      this.fieldHandlers,
      (handler) => this._completeFieldSetup(handler)
    );
  }

  /**
   * Check if resource should be managed
   */
  private _shouldManageResource(resourceName: string): boolean {
    return true;
  }

  /**
   * Emit an event
   */
  private _emit(event: string, data: any): void {
    if (this.database.emit) {
      this.database.emit(event, data);
    }
  }

  /**
   * Run consolidation for a field handler
   */
  async runConsolidation(
    handler: FieldHandler,
    resourceName: string,
    fieldName: string
  ): Promise<ConsolidationResult> {
    return runConsolidation(
      handler,
      this.storage as unknown as IPluginStorage,
      this.config,
      (event, data) => this._emit(event, data)
    );
  }

  /**
   * Run garbage collection for a field handler
   */
  private async _runGC(
    handler: FieldHandler,
    resourceName: string,
    fieldName: string
  ): Promise<void> {
    await runGarbageCollection(
      handler.transactionResource,
      this.storage as unknown as IPluginStorage,
      {
        resource: resourceName,
        field: fieldName,
        transactionRetention: this.config.transactionRetention,
        logLevel: this.config.logLevel
      },
      (event, data) => this._emit(event, data)
    );
  }

  /**
   * Get consolidated value for a record
   */
  async getConsolidatedValue(
    resourceName: string,
    fieldName: string,
    recordId: string
  ): Promise<number> {
    const handler = this._getHandler(resourceName, fieldName);
    return getConsolidatedValue(handler, recordId);
  }

  /**
   * Get cohort statistics
   */
  async getCohortStats(
    resourceName: string,
    fieldName: string
  ): Promise<CohortStats[]> {
    const handler = this._getHandler(resourceName, fieldName);
    return getCohortStats(handler, this.config);
  }

  /**
   * Recalculate a record's value
   */
  async recalculateRecord(
    resourceName: string,
    fieldName: string,
    recordId: string
  ): Promise<number> {
    const handler = this._getHandler(resourceName, fieldName);
    return recalculateRecord(handler, recordId);
  }

  /**
   * Get a field handler
   */
  private _getHandler(resourceName: string, fieldName: string): FieldHandler {
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
  private async _startCoordinator(): Promise<void> {
    await super.onStart();
  }

  /**
   * Stop coordinator mode
   */
  private async _stopCoordinator(): Promise<void> {
    await super.onStop();
  }

  /**
   * Coordinator work (runs only on leader)
   */
  protected async doCoordinatorWork(): Promise<void> {
    for (const [resourceName, resourceHandlers] of this.fieldHandlers) {
      for (const [fieldName, handler] of resourceHandlers) {
        await createTicketsForHandler(
          handler,
          this.config,
          (windowHours) => getCohortHoursWindow(windowHours, this.config.cohort.timezone)
        );
      }
    }

    await cleanupStaleLocks(this.storage as unknown as IPluginStorage, this.config);
  }

  /**
   * Worker work (runs on all instances)
   */
  protected async doWorkerWork(): Promise<void> {
    for (const [resourceName, resourceHandlers] of this.fieldHandlers) {
      for (const [fieldName, handler] of resourceHandlers) {
        if (!handler.ticketResource) continue;

        const tickets = await claimTickets(
          handler.ticketResource,
          this.workerId,
          this.config
        );

        for (const ticket of tickets) {
          await processTicket(ticket, handler, this.database as any);
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
  async getAnalytics(
    resourceName: string,
    fieldName: string,
    options: GetAnalyticsOptions = {}
  ): Promise<AnalyticsDataPoint[]> {
    return getAnalytics(resourceName, fieldName, options, this.fieldHandlers);
  }

  /**
   * Get month analytics broken down by day
   */
  async getMonthByDay(
    resourceName: string,
    fieldName: string,
    month: string,
    options: GetAnalyticsOptions = {}
  ): Promise<AnalyticsDataPoint[]> {
    return getMonthByDay(resourceName, fieldName, month, options, this.fieldHandlers);
  }

  /**
   * Get day analytics broken down by hour
   */
  async getDayByHour(
    resourceName: string,
    fieldName: string,
    date: string,
    options: GetAnalyticsOptions = {}
  ): Promise<AnalyticsDataPoint[]> {
    return getDayByHour(resourceName, fieldName, date, options, this.fieldHandlers);
  }

  /**
   * Get last N days analytics
   */
  async getLastNDays(
    resourceName: string,
    fieldName: string,
    days: number = 7,
    options: GetAnalyticsOptions = {}
  ): Promise<AnalyticsDataPoint[]> {
    return getLastNDays(resourceName, fieldName, days, options, this.fieldHandlers);
  }

  /**
   * Get year analytics broken down by month
   */
  async getYearByMonth(
    resourceName: string,
    fieldName: string,
    year: number,
    options: GetAnalyticsOptions = {}
  ): Promise<AnalyticsDataPoint[]> {
    return getYearByMonth(resourceName, fieldName, year, options, this.fieldHandlers);
  }

  /**
   * Get year analytics broken down by week
   */
  async getYearByWeek(
    resourceName: string,
    fieldName: string,
    year: number,
    options: GetAnalyticsOptions = {}
  ): Promise<AnalyticsDataPoint[]> {
    return getYearByWeek(resourceName, fieldName, year, options, this.fieldHandlers);
  }

  /**
   * Get month analytics broken down by week
   */
  async getMonthByWeek(
    resourceName: string,
    fieldName: string,
    month: string,
    options: GetAnalyticsOptions = {}
  ): Promise<AnalyticsDataPoint[]> {
    return getMonthByWeek(resourceName, fieldName, month, options, this.fieldHandlers);
  }

  /**
   * Get month analytics broken down by hour
   */
  async getMonthByHour(
    resourceName: string,
    fieldName: string,
    month: string,
    options: GetAnalyticsOptions = {}
  ): Promise<AnalyticsDataPoint[]> {
    return getMonthByHour(resourceName, fieldName, month, options, this.fieldHandlers);
  }

  /**
   * Get top records by activity
   */
  async getTopRecords(
    resourceName: string,
    fieldName: string,
    options: GetTopRecordsOptions = {}
  ): Promise<TopRecord[]> {
    return getTopRecords(resourceName, fieldName, options, this.fieldHandlers);
  }

  /**
   * Get year analytics broken down by day
   */
  async getYearByDay(
    resourceName: string,
    fieldName: string,
    year: number,
    options: GetAnalyticsOptions = {}
  ): Promise<AnalyticsDataPoint[]> {
    return getYearByDay(resourceName, fieldName, year, options, this.fieldHandlers);
  }

  /**
   * Get week analytics broken down by day
   */
  async getWeekByDay(
    resourceName: string,
    fieldName: string,
    week: string,
    options: GetAnalyticsOptions = {}
  ): Promise<AnalyticsDataPoint[]> {
    return getWeekByDay(resourceName, fieldName, week, options, this.fieldHandlers);
  }

  /**
   * Get week analytics broken down by hour
   */
  async getWeekByHour(
    resourceName: string,
    fieldName: string,
    week: string,
    options: GetAnalyticsOptions = {}
  ): Promise<AnalyticsDataPoint[]> {
    return getWeekByHour(resourceName, fieldName, week, options, this.fieldHandlers);
  }

  /**
   * Get last N hours analytics
   */
  async getLastNHours(
    resourceName: string,
    fieldName: string,
    hours: number = 24,
    options: GetAnalyticsOptions = {}
  ): Promise<AnalyticsDataPoint[]> {
    return getLastNHours(resourceName, fieldName, hours, options, this.fieldHandlers);
  }

  /**
   * Get last N weeks analytics
   */
  async getLastNWeeks(
    resourceName: string,
    fieldName: string,
    weeks: number = 4,
    options: GetAnalyticsOptions = {}
  ): Promise<AnalyticsDataPoint[]> {
    return getLastNWeeks(resourceName, fieldName, weeks, options, this.fieldHandlers);
  }

  /**
   * Get last N months analytics
   */
  async getLastNMonths(
    resourceName: string,
    fieldName: string,
    months: number = 12,
    options: GetAnalyticsOptions = {}
  ): Promise<AnalyticsDataPoint[]> {
    return getLastNMonths(resourceName, fieldName, months, options, this.fieldHandlers);
  }

  /**
   * Get raw transaction events
   */
  async getRawEvents(
    resourceName: string,
    fieldName: string,
    options: GetRawEventsOptions = {}
  ): Promise<any[]> {
    return getRawEvents(resourceName, fieldName, options, this.fieldHandlers);
  }

  /**
   * Fill gaps in analytics data
   */
  fillGaps(
    data: AnalyticsDataPoint[],
    period: string,
    startDate: string,
    endDate: string
  ): AnalyticsDataPoint[] {
    return fillGaps(data, period, startDate, endDate);
  }

  /**
   * Force consolidation for all handlers
   */
  async consolidateAll(): Promise<Map<string, ConsolidationResult>> {
    const results = new Map<string, ConsolidationResult>();

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
  getStatus(): Record<string, any> {
    const handlers: Record<string, string[]> = {};

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

export {
  type EventualConsistencyPluginOptions,
  type NormalizedConfig,
  type FieldHandler,
  type ConsolidationResult,
  type CohortStats,
  type Ticket,
  type ProcessTicketResults,
  type GetAnalyticsOptions,
  type GetTopRecordsOptions,
  type GetRawEventsOptions,
  type AnalyticsDataPoint,
  type TopRecord
};
