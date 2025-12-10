/**
 * Analytics for EventualConsistencyPlugin
 * @module eventual-consistency/analytics
 */
import { type Transaction, type FieldHandler, type AnalyticsResource } from './utils.js';
import type { AnalyticsConfig, CohortConfig } from './config.js';
export type FieldHandlers = Map<string, Map<string, FieldHandler>>;
export interface UpdateAnalyticsConfig {
    resource: string;
    field: string;
    analyticsConfig: AnalyticsConfig;
    cohort: CohortConfig;
    logLevel?: string;
}
export interface OperationBreakdown {
    [operation: string]: {
        count: number;
        sum: number;
    };
}
export interface AnalyticsRecord {
    id: string;
    field: string;
    period: string;
    cohort: string;
    transactionCount: number;
    totalValue: number;
    avgValue: number;
    minValue: number;
    maxValue: number;
    operations: OperationBreakdown;
    recordCount: number;
    consolidatedAt: string;
    updatedAt: string;
}
export interface AnalyticsDataPoint {
    cohort: string;
    count: number;
    sum: number;
    avg: number;
    min: number;
    max: number;
    operations?: OperationBreakdown;
    recordCount: number;
}
export interface GetAnalyticsOptions {
    period?: 'hour' | 'day' | 'week' | 'month';
    date?: string;
    startDate?: string;
    endDate?: string;
    month?: string;
    year?: number;
    breakdown?: 'operations' | boolean;
    recordId?: string;
    fillGaps?: boolean;
}
/**
 * Update analytics with consolidated transactions
 *
 * @param transactions - Transactions that were just consolidated
 * @param analyticsResource - Analytics resource
 * @param config - Plugin configuration
 */
export declare function updateAnalytics(transactions: Transaction[], analyticsResource: AnalyticsResource, config: UpdateAnalyticsConfig): Promise<void>;
/**
 * Fill gaps in analytics data with zeros for continuous time series
 *
 * @param data - Sparse analytics data
 * @param period - Period type ('hour', 'day', 'month')
 * @param startDate - Start date (ISO format)
 * @param endDate - End date (ISO format)
 * @returns Complete time series with gaps filled
 */
export declare function fillGaps(data: AnalyticsDataPoint[], period: string, startDate: string, endDate: string): AnalyticsDataPoint[];
/**
 * Get analytics for a specific period
 *
 * @param resourceName - Resource name
 * @param field - Field name
 * @param options - Query options
 * @param fieldHandlers - Field handlers map
 * @returns Analytics data
 */
export declare function getAnalytics(resourceName: string, field: string, options: GetAnalyticsOptions, fieldHandlers: FieldHandlers): Promise<AnalyticsDataPoint[]>;
/**
 * Get analytics for entire month, broken down by days
 */
export declare function getMonthByDay(resourceName: string, field: string, month: string, options: GetAnalyticsOptions, fieldHandlers: FieldHandlers): Promise<AnalyticsDataPoint[]>;
/**
 * Get analytics for entire day, broken down by hours
 */
export declare function getDayByHour(resourceName: string, field: string, date: string, options: GetAnalyticsOptions, fieldHandlers: FieldHandlers): Promise<AnalyticsDataPoint[]>;
/**
 * Get analytics for last N days, broken down by days
 */
export declare function getLastNDays(resourceName: string, field: string, days: number, options: GetAnalyticsOptions, fieldHandlers: FieldHandlers): Promise<AnalyticsDataPoint[]>;
/**
 * Get analytics for entire year, broken down by months
 */
export declare function getYearByMonth(resourceName: string, field: string, year: number, options: GetAnalyticsOptions, fieldHandlers: FieldHandlers): Promise<AnalyticsDataPoint[]>;
/**
 * Get analytics for entire year, broken down by weeks
 */
export declare function getYearByWeek(resourceName: string, field: string, year: number, options: GetAnalyticsOptions, fieldHandlers: FieldHandlers): Promise<AnalyticsDataPoint[]>;
/**
 * Get analytics for entire month, broken down by weeks
 */
export declare function getMonthByWeek(resourceName: string, field: string, month: string, options: GetAnalyticsOptions, fieldHandlers: FieldHandlers): Promise<AnalyticsDataPoint[]>;
/**
 * Get analytics for entire month, broken down by hours
 */
export declare function getMonthByHour(resourceName: string, field: string, month: string, options: GetAnalyticsOptions, fieldHandlers: FieldHandlers): Promise<AnalyticsDataPoint[]>;
export interface TopRecord {
    recordId: string;
    count: number;
    sum: number;
}
export interface GetTopRecordsOptions {
    period?: 'hour' | 'day' | 'month';
    date?: string;
    metric?: 'transactionCount' | 'totalValue';
    limit?: number;
}
/**
 * Get top records by volume
 */
export declare function getTopRecords(resourceName: string, field: string, options: GetTopRecordsOptions, fieldHandlers: FieldHandlers): Promise<TopRecord[]>;
/**
 * Get analytics for entire year, broken down by days
 */
export declare function getYearByDay(resourceName: string, field: string, year: number, options: GetAnalyticsOptions, fieldHandlers: FieldHandlers): Promise<AnalyticsDataPoint[]>;
/**
 * Get analytics for entire week, broken down by days
 */
export declare function getWeekByDay(resourceName: string, field: string, week: string, options: GetAnalyticsOptions, fieldHandlers: FieldHandlers): Promise<AnalyticsDataPoint[]>;
/**
 * Get analytics for entire week, broken down by hours
 */
export declare function getWeekByHour(resourceName: string, field: string, week: string, options: GetAnalyticsOptions, fieldHandlers: FieldHandlers): Promise<AnalyticsDataPoint[]>;
/**
 * Get analytics for last N hours
 */
export declare function getLastNHours(resourceName: string, field: string, hours: number | undefined, options: GetAnalyticsOptions, fieldHandlers: FieldHandlers): Promise<AnalyticsDataPoint[]>;
/**
 * Get analytics for last N weeks
 */
export declare function getLastNWeeks(resourceName: string, field: string, weeks: number | undefined, options: GetAnalyticsOptions, fieldHandlers: FieldHandlers): Promise<AnalyticsDataPoint[]>;
/**
 * Get analytics for last N months
 */
export declare function getLastNMonths(resourceName: string, field: string, months: number | undefined, options: GetAnalyticsOptions, fieldHandlers: FieldHandlers): Promise<AnalyticsDataPoint[]>;
export interface GetRawEventsOptions {
    recordId?: string;
    startDate?: string;
    endDate?: string;
    cohortDate?: string;
    cohortHour?: string;
    cohortMonth?: string;
    applied?: boolean;
    operation?: string;
    limit?: number;
}
/**
 * Get raw transaction events for custom aggregation
 */
export declare function getRawEvents(resourceName: string, field: string, options: GetRawEventsOptions, fieldHandlers: FieldHandlers): Promise<Transaction[]>;
//# sourceMappingURL=analytics.d.ts.map