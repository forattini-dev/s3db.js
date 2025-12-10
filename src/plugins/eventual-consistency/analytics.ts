/**
 * Analytics for EventualConsistencyPlugin
 * @module eventual-consistency/analytics
 */

import tryFn from '../../concerns/try-fn.js';
import { groupByCohort, ensureCohortHours, type Transaction, type FieldHandler, type AnalyticsResource } from './utils.js';
import { PluginError, AnalyticsNotEnabledError } from '../../errors.js';
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
export async function updateAnalytics(
  transactions: Transaction[],
  analyticsResource: AnalyticsResource,
  config: UpdateAnalyticsConfig
): Promise<void> {
  if (!analyticsResource || transactions.length === 0) return;

  if (!config.field) {
    throw new PluginError('config.field is undefined in updateAnalytics()', {
      pluginName: 'EventualConsistencyPlugin',
      operation: 'updateAnalytics',
      statusCode: 500,
      retriable: false,
      suggestion: 'Ensure each field handler uses its own configuration object when invoking analytics updates.',
      context: {
        resource: config.resource,
        field: config.field,
        transactions: transactions.length,
        analyticsResource: (analyticsResource as any)?.name || 'unknown'
      }
    });
  }

  try {
    const byHour = groupByCohort(transactions, 'cohortHour');
    const cohortCount = Object.keys(byHour).length;

    await Promise.all(
      Object.entries(byHour).map(([cohort, txns]) =>
        upsertAnalytics('hour', cohort, txns, analyticsResource, config)
      )
    );

    if (config.analyticsConfig.rollupStrategy === 'incremental') {
      const uniqueHours = Object.keys(byHour);

      await Promise.all(
        uniqueHours.map(cohortHour =>
          rollupAnalytics(cohortHour, analyticsResource, config)
        )
      );
    }
  } catch (error: any) {
    throw new PluginError(`Analytics update failed for ${config.resource}.${config.field}: ${error.message}`, {
      pluginName: 'EventualConsistencyPlugin',
      operation: 'updateAnalytics',
      statusCode: 500,
      retriable: true,
      suggestion: 'Check the console logs above for the failing transaction and fix the reducer or analytics configuration.',
      resource: config.resource,
      field: config.field,
      original: error
    });
  }
}

/**
 * Upsert analytics for a specific period and cohort
 */
async function upsertAnalytics(
  period: string,
  cohort: string,
  transactions: Transaction[],
  analyticsResource: AnalyticsResource,
  config: UpdateAnalyticsConfig
): Promise<void> {
  const id = `${period}-${cohort}`;

  const transactionCount = transactions.length;

  const signedValues = transactions.map(t => {
    if (t.operation === 'sub') return -t.value;
    return t.value;
  });

  const totalValue = signedValues.reduce((sum, v) => sum + v, 0);
  const avgValue = totalValue / transactionCount;
  const minValue = Math.min(...signedValues);
  const maxValue = Math.max(...signedValues);

  const operations = calculateOperationBreakdown(transactions);
  const recordCount = new Set(transactions.map(t => t.originalId)).size;

  const now = new Date().toISOString();

  const [existingOk, existingErr, existing] = await tryFn(() =>
    analyticsResource.get(id)
  ) as [boolean, Error | null, AnalyticsRecord | null];

  if (existingOk && existing) {
    const newTransactionCount = existing.transactionCount + transactionCount;
    const newTotalValue = existing.totalValue + totalValue;
    const newAvgValue = newTotalValue / newTransactionCount;
    const newMinValue = Math.min(existing.minValue, minValue);
    const newMaxValue = Math.max(existing.maxValue, maxValue);

    const newOperations: OperationBreakdown = { ...existing.operations };
    for (const [op, stats] of Object.entries(operations)) {
      if (!newOperations[op]) {
        newOperations[op] = { count: 0, sum: 0 };
      }
      newOperations[op].count += stats.count;
      newOperations[op].sum += stats.sum;
    }

    const newRecordCount = Math.max(existing.recordCount, recordCount);

    await tryFn(() =>
      analyticsResource.update(id, {
        transactionCount: newTransactionCount,
        totalValue: newTotalValue,
        avgValue: newAvgValue,
        minValue: newMinValue,
        maxValue: newMaxValue,
        operations: newOperations,
        recordCount: newRecordCount,
        updatedAt: now
      })
    );
  } else {
    await tryFn(() =>
      analyticsResource.insert({
        id,
        field: config.field,
        period,
        cohort,
        transactionCount,
        totalValue,
        avgValue,
        minValue,
        maxValue,
        operations,
        recordCount,
        consolidatedAt: now,
        updatedAt: now
      })
    );
  }
}

/**
 * Calculate operation breakdown
 */
function calculateOperationBreakdown(transactions: Transaction[]): OperationBreakdown {
  const breakdown: OperationBreakdown = {};

  for (const txn of transactions) {
    const op = txn.operation;
    if (!breakdown[op]) {
      breakdown[op] = { count: 0, sum: 0 };
    }
    breakdown[op].count++;

    const signedValue = op === 'sub' ? -txn.value : txn.value;
    breakdown[op].sum += signedValue;
  }

  return breakdown;
}

/**
 * Roll up hourly analytics to daily, weekly, and monthly
 */
async function rollupAnalytics(
  cohortHour: string,
  analyticsResource: AnalyticsResource,
  config: UpdateAnalyticsConfig
): Promise<void> {
  const cohortDate = cohortHour.substring(0, 10);
  const cohortMonth = cohortHour.substring(0, 7);

  const date = new Date(cohortDate);
  const cohortWeek = getCohortWeekFromDate(date);

  await rollupPeriod('day', cohortDate, cohortDate, analyticsResource, config);
  await rollupPeriod('week', cohortWeek, cohortWeek, analyticsResource, config);
  await rollupPeriod('month', cohortMonth, cohortMonth, analyticsResource, config);
}

/**
 * Get cohort week string from a date
 */
function getCohortWeekFromDate(date: Date): string {
  const target = new Date(date.valueOf());
  const dayNr = (date.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);

  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const firstThursday = new Date(yearStart.valueOf());
  if (yearStart.getUTCDay() !== 4) {
    firstThursday.setUTCDate(yearStart.getUTCDate() + ((4 - yearStart.getUTCDay()) + 7) % 7);
  }

  const weekNumber = 1 + Math.round((target.getTime() - firstThursday.getTime()) / 604800000);
  const weekYear = target.getUTCFullYear();

  return `${weekYear}-W${String(weekNumber).padStart(2, '0')}`;
}

/**
 * Roll up analytics for a specific period
 */
async function rollupPeriod(
  period: string,
  cohort: string,
  sourcePrefix: string,
  analyticsResource: AnalyticsResource,
  config: UpdateAnalyticsConfig
): Promise<void> {
  let sourcePeriod: string;
  if (period === 'day') {
    sourcePeriod = 'hour';
  } else if (period === 'week') {
    sourcePeriod = 'day';
  } else if (period === 'month') {
    sourcePeriod = 'day';
  } else {
    sourcePeriod = 'day';
  }

  const [ok, err, allAnalytics] = await tryFn(() =>
    analyticsResource.list()
  ) as [boolean, Error | null, AnalyticsRecord[] | null];

  if (!ok || !allAnalytics) return;

  let sourceAnalytics: AnalyticsRecord[];
  if (period === 'week') {
    sourceAnalytics = allAnalytics.filter(a => {
      if (a.period !== sourcePeriod) return false;
      const dayDate = new Date(a.cohort);
      const dayWeek = getCohortWeekFromDate(dayDate);
      return dayWeek === cohort;
    });
  } else {
    sourceAnalytics = allAnalytics.filter(a =>
      a.period === sourcePeriod && a.cohort.startsWith(sourcePrefix)
    );
  }

  if (sourceAnalytics.length === 0) return;

  const transactionCount = sourceAnalytics.reduce((sum, a) => sum + a.transactionCount, 0);
  const totalValue = sourceAnalytics.reduce((sum, a) => sum + a.totalValue, 0);
  const avgValue = totalValue / transactionCount;
  const minValue = Math.min(...sourceAnalytics.map(a => a.minValue));
  const maxValue = Math.max(...sourceAnalytics.map(a => a.maxValue));

  const operations: OperationBreakdown = {};
  for (const analytics of sourceAnalytics) {
    for (const [op, stats] of Object.entries(analytics.operations || {})) {
      if (!operations[op]) {
        operations[op] = { count: 0, sum: 0 };
      }
      operations[op].count += stats.count;
      operations[op].sum += stats.sum;
    }
  }

  const recordCount = Math.max(...sourceAnalytics.map(a => a.recordCount));

  const id = `${period}-${cohort}`;
  const now = new Date().toISOString();

  const [existingOk, existingErr, existing] = await tryFn(() =>
    analyticsResource.get(id)
  ) as [boolean, Error | null, AnalyticsRecord | null];

  if (existingOk && existing) {
    await tryFn(() =>
      analyticsResource.update(id, {
        transactionCount,
        totalValue,
        avgValue,
        minValue,
        maxValue,
        operations,
        recordCount,
        updatedAt: now
      })
    );
  } else {
    await tryFn(() =>
      analyticsResource.insert({
        id,
        field: config.field,
        period,
        cohort,
        transactionCount,
        totalValue,
        avgValue,
        minValue,
        maxValue,
        operations,
        recordCount,
        consolidatedAt: now,
        updatedAt: now
      })
    );
  }
}

/**
 * Fill gaps in analytics data with zeros for continuous time series
 *
 * @param data - Sparse analytics data
 * @param period - Period type ('hour', 'day', 'month')
 * @param startDate - Start date (ISO format)
 * @param endDate - End date (ISO format)
 * @returns Complete time series with gaps filled
 */
export function fillGaps(
  data: AnalyticsDataPoint[],
  period: string,
  startDate: string,
  endDate: string
): AnalyticsDataPoint[] {
  if (!data || data.length === 0) {
    data = [];
  }

  const dataMap = new Map<string, AnalyticsDataPoint>();
  data.forEach(item => {
    dataMap.set(item.cohort, item);
  });

  const result: AnalyticsDataPoint[] = [];
  const emptyRecord: Omit<AnalyticsDataPoint, 'cohort'> = {
    count: 0,
    sum: 0,
    avg: 0,
    min: 0,
    max: 0,
    recordCount: 0
  };

  if (period === 'hour') {
    const start = new Date(startDate + 'T00:00:00Z');
    const end = new Date(endDate + 'T23:59:59Z');

    for (let dt = new Date(start); dt <= end; dt.setHours(dt.getHours() + 1)) {
      const cohort = dt.toISOString().substring(0, 13);
      result.push(dataMap.get(cohort) || { cohort, ...emptyRecord });
    }
  } else if (period === 'day') {
    const start = new Date(startDate);
    const end = new Date(endDate);

    for (let dt = new Date(start); dt <= end; dt.setDate(dt.getDate() + 1)) {
      const cohort = dt.toISOString().substring(0, 10);
      result.push(dataMap.get(cohort) || { cohort, ...emptyRecord });
    }
  } else if (period === 'month') {
    const startYear = parseInt(startDate.substring(0, 4));
    const startMonth = parseInt(startDate.substring(5, 7));
    const endYear = parseInt(endDate.substring(0, 4));
    const endMonth = parseInt(endDate.substring(5, 7));

    for (let year = startYear; year <= endYear; year++) {
      const firstMonth = (year === startYear) ? startMonth : 1;
      const lastMonth = (year === endYear) ? endMonth : 12;

      for (let month = firstMonth; month <= lastMonth; month++) {
        const cohort = `${year}-${month.toString().padStart(2, '0')}`;
        result.push(dataMap.get(cohort) || { cohort, ...emptyRecord });
      }
    }
  }

  return result;
}

/**
 * Get analytics for a specific period
 *
 * @param resourceName - Resource name
 * @param field - Field name
 * @param options - Query options
 * @param fieldHandlers - Field handlers map
 * @returns Analytics data
 */
export async function getAnalytics(
  resourceName: string,
  field: string,
  options: GetAnalyticsOptions,
  fieldHandlers: FieldHandlers
): Promise<AnalyticsDataPoint[]> {
  const resourceHandlers = fieldHandlers.get(resourceName);
  if (!resourceHandlers) {
    throw new PluginError(`No eventual consistency configured for resource: ${resourceName}`, {
      pluginName: 'EventualConsistencyPlugin',
      operation: 'getAnalytics',
      statusCode: 404,
      retriable: false,
      suggestion: 'Ensure the resource is registered under EventualConsistencyPlugin resources.',
      resourceName
    });
  }

  const handler = resourceHandlers.get(field);
  if (!handler) {
    throw new PluginError(`No eventual consistency configured for field: ${resourceName}.${field}`, {
      pluginName: 'EventualConsistencyPlugin',
      operation: 'getAnalytics',
      statusCode: 404,
      retriable: false,
      suggestion: 'Add the field to EventualConsistencyPlugin resources configuration.',
      resourceName,
      field
    });
  }

  if (!handler.analyticsResource) {
    throw new AnalyticsNotEnabledError({ resourceName, field, pluginName: 'EventualConsistencyPlugin' });
  }

  const { period = 'day', date, startDate, endDate, month, year, breakdown = false, recordId } = options;

  if (recordId) {
    return await getAnalyticsForRecord(resourceName, field, recordId, options, handler);
  }

  const [ok, err, allAnalytics] = await tryFn(() =>
    handler.analyticsResource!.list()
  ) as [boolean, Error | null, AnalyticsRecord[] | null];

  if (!ok || !allAnalytics) {
    return [];
  }

  let filtered = allAnalytics.filter(a => a.period === period);

  if (date) {
    if (period === 'hour') {
      filtered = filtered.filter(a => a.cohort.startsWith(date));
    } else {
      filtered = filtered.filter(a => a.cohort === date);
    }
  } else if (startDate && endDate) {
    filtered = filtered.filter(a => a.cohort >= startDate && a.cohort <= endDate);
  } else if (month) {
    filtered = filtered.filter(a => a.cohort.startsWith(month));
  } else if (year) {
    filtered = filtered.filter(a => a.cohort.startsWith(String(year)));
  }

  filtered.sort((a, b) => a.cohort.localeCompare(b.cohort));

  if (breakdown === 'operations') {
    return filtered.map(a => ({
      cohort: a.cohort,
      count: a.transactionCount,
      sum: a.totalValue,
      avg: a.avgValue,
      min: a.minValue,
      max: a.maxValue,
      recordCount: a.recordCount,
      ...a.operations
    }));
  }

  return filtered.map(a => ({
    cohort: a.cohort,
    count: a.transactionCount,
    sum: a.totalValue,
    avg: a.avgValue,
    min: a.minValue,
    max: a.maxValue,
    operations: a.operations,
    recordCount: a.recordCount
  }));
}

/**
 * Get analytics for a specific record from transactions
 */
async function getAnalyticsForRecord(
  resourceName: string,
  field: string,
  recordId: string,
  options: GetAnalyticsOptions,
  handler: FieldHandler
): Promise<AnalyticsDataPoint[]> {
  const { period = 'day', date, startDate, endDate, month, year } = options;

  const [okTrue, errTrue, appliedTransactions] = await tryFn(() =>
    handler.transactionResource!.query({
      originalId: recordId,
      applied: true
    })
  ) as [boolean, Error | null, Transaction[] | null];

  const [okFalse, errFalse, pendingTransactions] = await tryFn(() =>
    handler.transactionResource!.query({
      originalId: recordId,
      applied: false
    })
  ) as [boolean, Error | null, Transaction[] | null];

  let allTransactions: Transaction[] = [
    ...(okTrue && appliedTransactions ? appliedTransactions : []),
    ...(okFalse && pendingTransactions ? pendingTransactions : [])
  ];

  if (allTransactions.length === 0) {
    return [];
  }

  allTransactions = ensureCohortHours(allTransactions, handler.config?.cohort?.timezone || 'UTC', false);

  let filtered = allTransactions;

  if (date) {
    if (period === 'hour') {
      filtered = filtered.filter(t => t.cohortHour && t.cohortHour.startsWith(date));
    } else if (period === 'day') {
      filtered = filtered.filter(t => t.cohortDate === date);
    } else if (period === 'month') {
      filtered = filtered.filter(t => t.cohortMonth && t.cohortMonth.startsWith(date));
    }
  } else if (startDate && endDate) {
    if (period === 'hour') {
      filtered = filtered.filter(t => t.cohortHour && t.cohortHour >= startDate && t.cohortHour <= endDate);
    } else if (period === 'day') {
      filtered = filtered.filter(t => t.cohortDate && t.cohortDate >= startDate && t.cohortDate <= endDate);
    } else if (period === 'month') {
      filtered = filtered.filter(t => t.cohortMonth && t.cohortMonth >= startDate && t.cohortMonth <= endDate);
    }
  } else if (month) {
    if (period === 'hour') {
      filtered = filtered.filter(t => t.cohortHour && t.cohortHour.startsWith(month));
    } else if (period === 'day') {
      filtered = filtered.filter(t => t.cohortDate && t.cohortDate.startsWith(month));
    }
  } else if (year) {
    if (period === 'hour') {
      filtered = filtered.filter(t => t.cohortHour && t.cohortHour.startsWith(String(year)));
    } else if (period === 'day') {
      filtered = filtered.filter(t => t.cohortDate && t.cohortDate.startsWith(String(year)));
    } else if (period === 'month') {
      filtered = filtered.filter(t => t.cohortMonth && t.cohortMonth.startsWith(String(year)));
    }
  }

  const cohortField = period === 'hour' ? 'cohortHour' : period === 'day' ? 'cohortDate' : 'cohortMonth';
  const aggregated = aggregateTransactionsByCohort(filtered, cohortField);

  return aggregated;
}

/**
 * Aggregate transactions by cohort field
 */
function aggregateTransactionsByCohort(
  transactions: Transaction[],
  cohortField: keyof Transaction
): AnalyticsDataPoint[] {
  const groups: Record<string, {
    cohort: string;
    count: number;
    sum: number;
    min: number;
    max: number;
    recordCount: Set<string>;
    operations: OperationBreakdown;
  }> = {};

  for (const txn of transactions) {
    const cohort = txn[cohortField] as string;
    if (!cohort) continue;

    if (!groups[cohort]) {
      groups[cohort] = {
        cohort,
        count: 0,
        sum: 0,
        min: Infinity,
        max: -Infinity,
        recordCount: new Set(),
        operations: {}
      };
    }

    const group = groups[cohort];
    const signedValue = txn.operation === 'sub' ? -txn.value : txn.value;

    group.count++;
    group.sum += signedValue;
    group.min = Math.min(group.min, signedValue);
    group.max = Math.max(group.max, signedValue);
    group.recordCount.add(txn.originalId);

    const op = txn.operation;
    if (!group.operations[op]) {
      group.operations[op] = { count: 0, sum: 0 };
    }
    group.operations[op].count++;
    group.operations[op].sum += signedValue;
  }

  return Object.values(groups)
    .map(g => ({
      cohort: g.cohort,
      count: g.count,
      sum: g.sum,
      avg: g.sum / g.count,
      min: g.min === Infinity ? 0 : g.min,
      max: g.max === -Infinity ? 0 : g.max,
      recordCount: g.recordCount.size,
      operations: g.operations
    }))
    .sort((a, b) => a.cohort.localeCompare(b.cohort));
}

/**
 * Get analytics for entire month, broken down by days
 */
export async function getMonthByDay(
  resourceName: string,
  field: string,
  month: string,
  options: GetAnalyticsOptions,
  fieldHandlers: FieldHandlers
): Promise<AnalyticsDataPoint[]> {
  const year = parseInt(month.substring(0, 4));
  const monthNum = parseInt(month.substring(5, 7));

  const firstDay = new Date(year, monthNum - 1, 1);
  const lastDay = new Date(year, monthNum, 0);

  const startDate = firstDay.toISOString().substring(0, 10);
  const endDate = lastDay.toISOString().substring(0, 10);

  const data = await getAnalytics(resourceName, field, {
    period: 'day',
    startDate,
    endDate
  }, fieldHandlers);

  if (options.fillGaps) {
    return fillGaps(data, 'day', startDate as string, endDate as string);
  }

  return data;
}

/**
 * Get analytics for entire day, broken down by hours
 */
export async function getDayByHour(
  resourceName: string,
  field: string,
  date: string,
  options: GetAnalyticsOptions,
  fieldHandlers: FieldHandlers
): Promise<AnalyticsDataPoint[]> {
  const data = await getAnalytics(resourceName, field, {
    period: 'hour',
    date
  }, fieldHandlers);

  if (options.fillGaps) {
    return fillGaps(data, 'hour', date, date);
  }

  return data;
}

/**
 * Get analytics for last N days, broken down by days
 */
export async function getLastNDays(
  resourceName: string,
  field: string,
  days: number,
  options: GetAnalyticsOptions,
  fieldHandlers: FieldHandlers
): Promise<AnalyticsDataPoint[]> {
  const dates = Array.from({ length: days }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - i);
    return date.toISOString().substring(0, 10);
  }).reverse();

  const data = await getAnalytics(resourceName, field, {
    ...options,
    period: 'day',
    startDate: dates[0],
    endDate: dates[dates.length - 1]
  }, fieldHandlers);

  if (options.fillGaps) {
    return fillGaps(data, 'day', dates[0] as string, dates[dates.length - 1] as string);
  }

  return data;
}

/**
 * Get analytics for entire year, broken down by months
 */
export async function getYearByMonth(
  resourceName: string,
  field: string,
  year: number,
  options: GetAnalyticsOptions,
  fieldHandlers: FieldHandlers
): Promise<AnalyticsDataPoint[]> {
  const data = await getAnalytics(resourceName, field, {
    period: 'month',
    year
  }, fieldHandlers);

  if (options.fillGaps) {
    const startDate = `${year}-01`;
    const endDate = `${year}-12`;
    return fillGaps(data, 'month', startDate, endDate);
  }

  return data;
}

/**
 * Get analytics for entire year, broken down by weeks
 */
export async function getYearByWeek(
  resourceName: string,
  field: string,
  year: number,
  options: GetAnalyticsOptions,
  fieldHandlers: FieldHandlers
): Promise<AnalyticsDataPoint[]> {
  const data = await getAnalytics(resourceName, field, {
    period: 'week',
    year
  }, fieldHandlers);

  if (options.fillGaps) {
    const startWeek = `${year}-W01`;
    const endWeek = `${year}-W53`;
    return fillGaps(data, 'week', startWeek, endWeek);
  }

  return data;
}

/**
 * Get analytics for entire month, broken down by weeks
 */
export async function getMonthByWeek(
  resourceName: string,
  field: string,
  month: string,
  options: GetAnalyticsOptions,
  fieldHandlers: FieldHandlers
): Promise<AnalyticsDataPoint[]> {
  const year = parseInt(month.substring(0, 4));
  const monthNum = parseInt(month.substring(5, 7));

  const firstDay = new Date(year, monthNum - 1, 1);
  const lastDay = new Date(year, monthNum, 0);

  const firstWeek = getCohortWeekFromDate(firstDay);
  const lastWeek = getCohortWeekFromDate(lastDay);

  const data = await getAnalytics(resourceName, field, {
    period: 'week',
    startDate: firstWeek,
    endDate: lastWeek
  }, fieldHandlers);

  return data;
}

/**
 * Get analytics for entire month, broken down by hours
 */
export async function getMonthByHour(
  resourceName: string,
  field: string,
  month: string,
  options: GetAnalyticsOptions,
  fieldHandlers: FieldHandlers
): Promise<AnalyticsDataPoint[]> {
  let year: number;
  let monthNum: number;

  if (month === 'last') {
    const now = new Date();
    now.setMonth(now.getMonth() - 1);
    year = now.getFullYear();
    monthNum = now.getMonth() + 1;
  } else {
    year = parseInt(month.substring(0, 4));
    monthNum = parseInt(month.substring(5, 7));
  }

  const firstDay = new Date(year, monthNum - 1, 1);
  const lastDay = new Date(year, monthNum, 0);

  const startDate = firstDay.toISOString().substring(0, 10);
  const endDate = lastDay.toISOString().substring(0, 10);

  const data = await getAnalytics(resourceName, field, {
    period: 'hour',
    startDate,
    endDate
  }, fieldHandlers);

  if (options.fillGaps) {
    return fillGaps(data, 'hour', startDate, endDate);
  }

  return data;
}

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
export async function getTopRecords(
  resourceName: string,
  field: string,
  options: GetTopRecordsOptions,
  fieldHandlers: FieldHandlers
): Promise<TopRecord[]> {
  const resourceHandlers = fieldHandlers.get(resourceName);
  if (!resourceHandlers) {
    throw new PluginError(`No eventual consistency configured for resource: ${resourceName}`, {
      pluginName: 'EventualConsistencyPlugin',
      operation: 'getTopRecords',
      statusCode: 404,
      retriable: false,
      suggestion: 'Add the resource to EventualConsistencyPlugin resources configuration.',
      resourceName
    });
  }

  const handler = resourceHandlers.get(field);
  if (!handler) {
    throw new PluginError(`No eventual consistency configured for field: ${resourceName}.${field}`, {
      pluginName: 'EventualConsistencyPlugin',
      operation: 'getTopRecords',
      statusCode: 404,
      retriable: false,
      suggestion: 'Ensure the field is configured for eventual consistency before querying analytics.',
      resourceName,
      field
    });
  }

  if (!handler.transactionResource) {
    throw new PluginError('Transaction resource not initialized', {
      pluginName: 'EventualConsistencyPlugin',
      operation: 'getTopRecords',
      statusCode: 500,
      retriable: false,
      suggestion: 'Verify plugin installation completed successfully and transaction resources were created.',
      resourceName,
      field
    });
  }

  const { period = 'day', date, metric = 'transactionCount', limit = 10 } = options;

  const [ok, err, transactions] = await tryFn(() =>
    handler.transactionResource!.list()
  ) as [boolean, Error | null, Transaction[] | null];

  if (!ok || !transactions) {
    return [];
  }

  let filtered = transactions;
  if (date) {
    if (period === 'hour') {
      filtered = transactions.filter(t => t.cohortHour && t.cohortHour.startsWith(date));
    } else if (period === 'day') {
      filtered = transactions.filter(t => t.cohortDate === date);
    } else if (period === 'month') {
      filtered = transactions.filter(t => t.cohortMonth && t.cohortMonth.startsWith(date));
    }
  }

  const byRecord: Record<string, { count: number; sum: number }> = {};
  for (const txn of filtered) {
    const recordId = txn.originalId;
    if (!byRecord[recordId]) {
      byRecord[recordId] = { count: 0, sum: 0 };
    }
    byRecord[recordId].count++;
    byRecord[recordId].sum += txn.value;
  }

  const records: TopRecord[] = Object.entries(byRecord).map(([recordId, stats]) => ({
    recordId,
    count: stats.count,
    sum: stats.sum
  }));

  records.sort((a, b) => {
    if (metric === 'transactionCount') {
      return b.count - a.count;
    } else if (metric === 'totalValue') {
      return b.sum - a.sum;
    }
    return 0;
  });

  return records.slice(0, limit);
}

/**
 * Get analytics for entire year, broken down by days
 */
export async function getYearByDay(
  resourceName: string,
  field: string,
  year: number,
  options: GetAnalyticsOptions,
  fieldHandlers: FieldHandlers
): Promise<AnalyticsDataPoint[]> {
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;

  const data = await getAnalytics(resourceName, field, {
    period: 'day',
    startDate,
    endDate
  }, fieldHandlers);

  if (options.fillGaps) {
    return fillGaps(data, 'day', startDate as string, endDate as string);
  }

  return data;
}

/**
 * Get analytics for entire week, broken down by days
 */
export async function getWeekByDay(
  resourceName: string,
  field: string,
  week: string,
  options: GetAnalyticsOptions,
  fieldHandlers: FieldHandlers
): Promise<AnalyticsDataPoint[]> {
  const year = parseInt(week.substring(0, 4));
  const weekNum = parseInt(week.substring(6, 8));

  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const firstMonday = new Date(Date.UTC(year, 0, 4 - jan4Day + 1));
  const weekStart = new Date(firstMonday);
  weekStart.setUTCDate(weekStart.getUTCDate() + (weekNum - 1) * 7);

  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(weekStart);
    day.setUTCDate(weekStart.getUTCDate() + i);
    days.push(day.toISOString().substring(0, 10));
  }

  const startDate = days[0];
  const endDate = days[6];

  const data = await getAnalytics(resourceName, field, {
    period: 'day',
    startDate,
    endDate
  }, fieldHandlers);

  if (options.fillGaps) {
    return fillGaps(data, 'day', startDate as string, endDate as string);
  }

  return data;
}

/**
 * Get analytics for entire week, broken down by hours
 */
export async function getWeekByHour(
  resourceName: string,
  field: string,
  week: string,
  options: GetAnalyticsOptions,
  fieldHandlers: FieldHandlers
): Promise<AnalyticsDataPoint[]> {
  const year = parseInt(week.substring(0, 4));
  const weekNum = parseInt(week.substring(6, 8));

  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const firstMonday = new Date(Date.UTC(year, 0, 4 - jan4Day + 1));
  const weekStart = new Date(firstMonday);
  weekStart.setUTCDate(weekStart.getUTCDate() + (weekNum - 1) * 7);

  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);

  const startDate = weekStart.toISOString().substring(0, 10);
  const endDate = weekEnd.toISOString().substring(0, 10);

  const data = await getAnalytics(resourceName, field, {
    period: 'hour',
    startDate,
    endDate
  }, fieldHandlers);

  if (options.fillGaps) {
    return fillGaps(data, 'hour', startDate, endDate);
  }

  return data;
}

/**
 * Get analytics for last N hours
 */
export async function getLastNHours(
  resourceName: string,
  field: string,
  hours: number = 24,
  options: GetAnalyticsOptions,
  fieldHandlers: FieldHandlers
): Promise<AnalyticsDataPoint[]> {
  const now = new Date();
  const hoursAgo = new Date(now);
  hoursAgo.setHours(hoursAgo.getHours() - hours + 1);

  const startHour = hoursAgo.toISOString().substring(0, 13);
  const endHour = now.toISOString().substring(0, 13);

  const data = await getAnalytics(resourceName, field, {
    ...options,
    period: 'hour',
    startDate: startHour,
    endDate: endHour
  }, fieldHandlers);

  if (options.fillGaps) {
    const result: AnalyticsDataPoint[] = [];
    const emptyRecord: Omit<AnalyticsDataPoint, 'cohort'> = { count: 0, sum: 0, avg: 0, min: 0, max: 0, recordCount: 0 };
    const dataMap = new Map(data.map(d => [d.cohort, d]));

    const current = new Date(hoursAgo);
    for (let i = 0; i < hours; i++) {
      const cohort = current.toISOString().substring(0, 13);
      result.push(dataMap.get(cohort) || { cohort, ...emptyRecord });
      current.setHours(current.getHours() + 1);
    }

    return result;
  }

  return data;
}

/**
 * Get analytics for last N weeks
 */
export async function getLastNWeeks(
  resourceName: string,
  field: string,
  weeks: number = 4,
  options: GetAnalyticsOptions,
  fieldHandlers: FieldHandlers
): Promise<AnalyticsDataPoint[]> {
  const now = new Date();
  const weeksAgo = new Date(now);
  weeksAgo.setDate(weeksAgo.getDate() - (weeks * 7));

  const weekCohorts: string[] = [];
  const currentDate = new Date(weeksAgo);
  while (currentDate <= now) {
    const weekCohort = getCohortWeekFromDate(currentDate);
    if (!weekCohorts.includes(weekCohort)) {
      weekCohorts.push(weekCohort);
    }
    currentDate.setDate(currentDate.getDate() + 7);
  }

  const startWeek = weekCohorts[0];
  const endWeek = weekCohorts[weekCohorts.length - 1];

  const data = await getAnalytics(resourceName, field, {
    period: 'week',
    startDate: startWeek,
    endDate: endWeek
  }, fieldHandlers);

  return data;
}

/**
 * Get analytics for last N months
 */
export async function getLastNMonths(
  resourceName: string,
  field: string,
  months: number = 12,
  options: GetAnalyticsOptions,
  fieldHandlers: FieldHandlers
): Promise<AnalyticsDataPoint[]> {
  const now = new Date();
  const monthsAgo = new Date(now);
  monthsAgo.setMonth(monthsAgo.getMonth() - months + 1);

  const startDate = monthsAgo.toISOString().substring(0, 7);
  const endDate = now.toISOString().substring(0, 7);

  const data = await getAnalytics(resourceName, field, {
    ...options,
    period: 'month',
    startDate,
    endDate
  }, fieldHandlers);

  if (options.fillGaps) {
    const result: AnalyticsDataPoint[] = [];
    const emptyRecord: Omit<AnalyticsDataPoint, 'cohort'> = { count: 0, sum: 0, avg: 0, min: 0, max: 0, recordCount: 0 };
    const dataMap = new Map(data.map(d => [d.cohort, d]));

    const current = new Date(monthsAgo);
    current.setDate(1);
    for (let i = 0; i < months; i++) {
      const cohort = current.toISOString().substring(0, 7);
      result.push(dataMap.get(cohort) || { cohort, ...emptyRecord });
      current.setMonth(current.getMonth() + 1);
    }

    return result;
  }

  return data;
}

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
export async function getRawEvents(
  resourceName: string,
  field: string,
  options: GetRawEventsOptions,
  fieldHandlers: FieldHandlers
): Promise<Transaction[]> {
  const resourceHandlers = fieldHandlers.get(resourceName);
  if (!resourceHandlers) {
    throw new PluginError(`No eventual consistency configured for resource: ${resourceName}`, {
      pluginName: 'EventualConsistencyPlugin',
      operation: 'getRawEvents',
      statusCode: 404,
      retriable: false,
      suggestion: 'Add the resource under EventualConsistencyPlugin configuration to retrieve raw events.',
      resourceName
    });
  }

  const handler = resourceHandlers.get(field);
  if (!handler) {
    throw new PluginError(`No eventual consistency configured for field: ${resourceName}.${field}`, {
      pluginName: 'EventualConsistencyPlugin',
      operation: 'getRawEvents',
      statusCode: 404,
      retriable: false,
      suggestion: 'Ensure the field is included in EventualConsistencyPlugin configuration.',
      resourceName,
      field
    });
  }

  if (!handler.transactionResource) {
    throw new PluginError('Transaction resource not initialized', {
      pluginName: 'EventualConsistencyPlugin',
      operation: 'getRawEvents',
      statusCode: 500,
      retriable: false,
      suggestion: 'Verify plugin installation completed successfully and transaction resources were created.',
      resourceName,
      field
    });
  }

  const {
    recordId,
    startDate,
    endDate,
    cohortDate,
    cohortHour,
    cohortMonth,
    applied,
    operation,
    limit
  } = options;

  const query: Record<string, any> = {};

  if (recordId !== undefined) {
    query.originalId = recordId;
  }

  if (applied !== undefined) {
    query.applied = applied;
  }

  const [ok, err, allTransactions] = await tryFn(() =>
    handler.transactionResource!.query(query)
  ) as [boolean, Error | null, Transaction[] | null];

  if (!ok || !allTransactions) {
    return [];
  }

  let filtered = allTransactions;

  if (operation !== undefined) {
    filtered = filtered.filter(t => t.operation === operation);
  }

  if (cohortDate) {
    filtered = filtered.filter(t => t.cohortDate === cohortDate);
  }

  if (cohortHour) {
    filtered = filtered.filter(t => t.cohortHour === cohortHour);
  }

  if (cohortMonth) {
    filtered = filtered.filter(t => t.cohortMonth === cohortMonth);
  }

  if (startDate && endDate) {
    const isHourly = startDate.length > 10;
    const cohortField = isHourly ? 'cohortHour' : 'cohortDate';

    filtered = filtered.filter(t =>
      t[cohortField] && t[cohortField]! >= startDate && t[cohortField]! <= endDate
    );
  } else if (startDate) {
    const isHourly = startDate.length > 10;
    const cohortField = isHourly ? 'cohortHour' : 'cohortDate';
    filtered = filtered.filter(t => t[cohortField] && t[cohortField]! >= startDate);
  } else if (endDate) {
    const isHourly = endDate.length > 10;
    const cohortField = isHourly ? 'cohortHour' : 'cohortDate';
    filtered = filtered.filter(t => t[cohortField] && t[cohortField]! <= endDate);
  }

  filtered.sort((a, b) => {
    const aTime = new Date(a.timestamp || a.createdAt!).getTime();
    const bTime = new Date(b.timestamp || b.createdAt!).getTime();
    return bTime - aTime;
  });

  if (limit && limit > 0) {
    filtered = filtered.slice(0, limit);
  }

  return filtered;
}
