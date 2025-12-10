/**
 * EventualConsistencyPlugin - Eventually consistent counters and aggregations
 * @module eventual-consistency
 */
import { CoordinatorPlugin } from '../concerns/coordinator-plugin.class.js';
import { type EventualConsistencyPluginOptions, type NormalizedConfig } from './config.js';
import { type FieldHandler } from './utils.js';
import { type ConsolidationResult, type CohortStats } from './consolidation.js';
import { type Ticket, type ProcessTicketResults } from './tickets.js';
import { type GetAnalyticsOptions, type GetTopRecordsOptions, type GetRawEventsOptions, type AnalyticsDataPoint, type TopRecord } from './analytics.js';
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
export declare class EventualConsistencyPlugin extends CoordinatorPlugin<EventualConsistencyPluginOptions> {
    config: NormalizedConfig;
    private fieldHandlers;
    private storage;
    workerId: string;
    constructor(options?: EventualConsistencyPluginOptions);
    /**
     * Initialize field handlers from configuration
     */
    private _initializeFieldHandlers;
    /**
     * Plugin installation hook
     */
    onInstall(): Promise<void>;
    /**
     * Plugin start hook
     */
    onStart(): Promise<void>;
    /**
     * Plugin stop hook
     */
    onStop(): Promise<void>;
    /**
     * Complete field setup for a handler
     */
    private _completeFieldSetup;
    /**
     * Watch for resource creation
     */
    private _watchForResource;
    /**
     * Check if resource should be managed
     */
    private _shouldManageResource;
    /**
     * Emit an event
     */
    private _emit;
    /**
     * Run consolidation for a field handler
     */
    runConsolidation(handler: FieldHandler, resourceName: string, fieldName: string): Promise<ConsolidationResult>;
    /**
     * Run garbage collection for a field handler
     */
    private _runGC;
    /**
     * Get consolidated value for a record
     */
    getConsolidatedValue(resourceName: string, fieldName: string, recordId: string): Promise<number>;
    /**
     * Get cohort statistics
     */
    getCohortStats(resourceName: string, fieldName: string): Promise<CohortStats[]>;
    /**
     * Recalculate a record's value
     */
    recalculateRecord(resourceName: string, fieldName: string, recordId: string): Promise<number>;
    /**
     * Get a field handler
     */
    private _getHandler;
    /**
     * Start coordinator mode
     */
    private _startCoordinator;
    /**
     * Stop coordinator mode
     */
    private _stopCoordinator;
    /**
     * Coordinator work (runs only on leader)
     */
    protected doCoordinatorWork(): Promise<void>;
    /**
     * Worker work (runs on all instances)
     */
    protected doWorkerWork(): Promise<void>;
    /**
     * Get analytics for a field
     */
    getAnalytics(resourceName: string, fieldName: string, options?: GetAnalyticsOptions): Promise<AnalyticsDataPoint[]>;
    /**
     * Get month analytics broken down by day
     */
    getMonthByDay(resourceName: string, fieldName: string, month: string, options?: GetAnalyticsOptions): Promise<AnalyticsDataPoint[]>;
    /**
     * Get day analytics broken down by hour
     */
    getDayByHour(resourceName: string, fieldName: string, date: string, options?: GetAnalyticsOptions): Promise<AnalyticsDataPoint[]>;
    /**
     * Get last N days analytics
     */
    getLastNDays(resourceName: string, fieldName: string, days?: number, options?: GetAnalyticsOptions): Promise<AnalyticsDataPoint[]>;
    /**
     * Get year analytics broken down by month
     */
    getYearByMonth(resourceName: string, fieldName: string, year: number, options?: GetAnalyticsOptions): Promise<AnalyticsDataPoint[]>;
    /**
     * Get year analytics broken down by week
     */
    getYearByWeek(resourceName: string, fieldName: string, year: number, options?: GetAnalyticsOptions): Promise<AnalyticsDataPoint[]>;
    /**
     * Get month analytics broken down by week
     */
    getMonthByWeek(resourceName: string, fieldName: string, month: string, options?: GetAnalyticsOptions): Promise<AnalyticsDataPoint[]>;
    /**
     * Get month analytics broken down by hour
     */
    getMonthByHour(resourceName: string, fieldName: string, month: string, options?: GetAnalyticsOptions): Promise<AnalyticsDataPoint[]>;
    /**
     * Get top records by activity
     */
    getTopRecords(resourceName: string, fieldName: string, options?: GetTopRecordsOptions): Promise<TopRecord[]>;
    /**
     * Get year analytics broken down by day
     */
    getYearByDay(resourceName: string, fieldName: string, year: number, options?: GetAnalyticsOptions): Promise<AnalyticsDataPoint[]>;
    /**
     * Get week analytics broken down by day
     */
    getWeekByDay(resourceName: string, fieldName: string, week: string, options?: GetAnalyticsOptions): Promise<AnalyticsDataPoint[]>;
    /**
     * Get week analytics broken down by hour
     */
    getWeekByHour(resourceName: string, fieldName: string, week: string, options?: GetAnalyticsOptions): Promise<AnalyticsDataPoint[]>;
    /**
     * Get last N hours analytics
     */
    getLastNHours(resourceName: string, fieldName: string, hours?: number, options?: GetAnalyticsOptions): Promise<AnalyticsDataPoint[]>;
    /**
     * Get last N weeks analytics
     */
    getLastNWeeks(resourceName: string, fieldName: string, weeks?: number, options?: GetAnalyticsOptions): Promise<AnalyticsDataPoint[]>;
    /**
     * Get last N months analytics
     */
    getLastNMonths(resourceName: string, fieldName: string, months?: number, options?: GetAnalyticsOptions): Promise<AnalyticsDataPoint[]>;
    /**
     * Get raw transaction events
     */
    getRawEvents(resourceName: string, fieldName: string, options?: GetRawEventsOptions): Promise<any[]>;
    /**
     * Fill gaps in analytics data
     */
    fillGaps(data: AnalyticsDataPoint[], period: string, startDate: string, endDate: string): AnalyticsDataPoint[];
    /**
     * Force consolidation for all handlers
     */
    consolidateAll(): Promise<Map<string, ConsolidationResult>>;
    /**
     * Get plugin status
     */
    getStatus(): Record<string, any>;
}
export default EventualConsistencyPlugin;
export { type EventualConsistencyPluginOptions, type NormalizedConfig, type FieldHandler, type ConsolidationResult, type CohortStats, type Ticket, type ProcessTicketResults, type GetAnalyticsOptions, type GetTopRecordsOptions, type GetRawEventsOptions, type AnalyticsDataPoint, type TopRecord };
//# sourceMappingURL=index.d.ts.map