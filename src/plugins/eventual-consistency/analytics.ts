/**
 * Analytics for EventualConsistencyPlugin
 * @module eventual-consistency/analytics
 */

import tryFn from '../../concerns/try-fn.js';
import { TasksPool } from '../../tasks/tasks-pool.class.js';
import {
  ensureCohortHours,
  groupByCohort,
  type Transaction,
  type TransactionResource,
  type FieldHandler,
  type AnalyticsResource
} from './utils.js';
import { PluginError, AnalyticsNotEnabledError } from '../../errors.js';
import type { AnalyticsConfig, CohortConfig } from './config.js';

export type FieldHandlers = Map<string, Map<string, FieldHandler>>;

export interface UpdateAnalyticsConfig {
  resource: string;
  field: string;
  analyticsConfig: AnalyticsConfig;
  cohort: CohortConfig;
  logLevel?: string;
  transactionResource?: TransactionResource;
}

type AnalyticsPeriod = 'hour' | 'day' | 'week' | 'month';

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

type AnalyticsRecordWithEtag = AnalyticsRecord & {
  _etag?: string;
};

interface UpdatableAnalyticsResource extends Omit<AnalyticsResource, 'query'> {
  updateConditional?: (
    id: string,
    data: Partial<AnalyticsRecordWithEtag>,
    options: { ifMatch: string }
  ) => Promise<{ success: boolean; data?: AnalyticsRecordWithEtag; etag?: string; error?: string }>;
  query?: (
    query: Record<string, any>,
    options?: {
      limit?: number;
      offset?: number;
      partition?: string | null;
      partitionValues?: Record<string, any>;
    }
  ) => Promise<AnalyticsRecordWithEtag[]>;
}

function isQueryUnsupportedError(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('message' in error)) {
    return false;
  }

  const message = String((error as Error).message || '').toLowerCase();
  return (
    message.includes('not supported') ||
    message.includes('not implemented') ||
    message.includes('unsupported') ||
    message.includes('query is not a function') ||
    message.includes('method not found')
  );
}

interface QueryableResource<T> {
  query?: (
    query: Record<string, any>,
    options?: {
      limit?: number;
      offset?: number;
      partition?: string | null;
      partitionValues?: Record<string, any>;
    }
  ) => Promise<T[]>;
  list?: (options?: { limit?: number; offset?: number }) => Promise<T[]>;
}

interface UpsertAnalyticsDependencies {
  id: string;
  period: string;
  cohort: string;
  existing: AnalyticsRecordWithEtag | null;
  now: string;
  config: UpdateAnalyticsConfig;
  analyticsResource: AnalyticsResource;
  summary: AnalyticsStats;
  replaceExisting?: boolean;
}

interface UpsertAnalyticsSummaryDependencies {
  id: string;
  period: string;
  cohort: string;
  existing: AnalyticsRecordWithEtag | null;
  now: string;
  config: UpdateAnalyticsConfig;
  summary: AnalyticsStats;
  analyticsResource: AnalyticsResource;
  replaceExisting?: boolean;
}

interface QueryOptions {
  limit?: number;
  offset?: number;
  partition?: string | null;
  partitionValues?: Record<string, any>;
}

interface AnalyticsStats {
  transactionCount: number;
  totalValue: number;
  avgValue: number;
  minValue: number;
  maxValue: number;
  operations: OperationBreakdown;
  recordCount: number;
}

const MAX_ANALYTICS_UPDATE_RETRIES = 5;
const ANALYTICS_QUERY_LIMIT = 500;
const ANALYTICS_READ_CONCURRENCY = 12;

const ANALYTICS_TRANSACTION_PARTITION_BY_PERIOD: Record<AnalyticsPeriod, {
  partition: string;
  partitionValues: (cohort: string, extraFilter?: Record<string, any>) => Record<string, any>;
  filter: (cohort: string, extraFilter?: Record<string, any>) => Record<string, any>;
}> = {
  hour: {
    partition: 'byCohortHour',
    partitionValues: (cohortHour, extraFilter = {}) => ({ cohortHour, ...extraFilter }),
    filter: (cohortHour, extraFilter = {}) => ({ cohortHour, ...extraFilter })
  },
  day: {
    partition: 'byCohortDate',
    partitionValues: (cohortDate, extraFilter = {}) => ({ cohortDate, ...extraFilter }),
    filter: (cohortDate, extraFilter = {}) => ({ cohortDate, ...extraFilter })
  },
  week: {
    partition: 'byCohortWeek',
    partitionValues: (cohortWeek, extraFilter = {}) => ({ cohortWeek, ...extraFilter }),
    filter: (cohortWeek, extraFilter = {}) => ({ cohortWeek, ...extraFilter })
  },
  month: {
    partition: 'byCohortMonth',
    partitionValues: (cohortMonth, extraFilter = {}) => ({ cohortMonth, ...extraFilter }),
    filter: (cohortMonth, extraFilter = {}) => ({ cohortMonth, ...extraFilter })
  }
};

function calculateRecordCountFromTransactions(transactions: Transaction[]): number {
  return new Set(transactions.map((tx) => tx.originalId)).size;
}

function normalizeFilter(filter: Record<string, any>): Record<string, any> {
  return Object.entries(filter).reduce<Record<string, any>>((result, [key, value]) => {
    if (value !== undefined) {
      result[key] = value;
    }
    return result;
  }, {});
}

function getRecordIdentity(record: Record<string, any>): string {
  if (record.id !== undefined && record.id !== null) {
    return `id:${record.id}`;
  }

  if (record.originalId !== undefined && record.originalId !== null) {
    return `originalId:${record.originalId}`;
  }

  return `raw:${JSON.stringify(record)}`;
}

function pushUniqueRecord<T>(records: T[], seen: Set<string>, record: T): void {
  const identity = getRecordIdentity(record as Record<string, any>);
  if (seen.has(identity)) return;
  seen.add(identity);
  records.push(record);
}

async function queryResourceRecords<T>(
  resource: QueryableResource<T>,
  filter: Record<string, any>,
  options: QueryOptions = {}
): Promise<T[]> {
  const normalizedFilter = normalizeFilter(filter);
  const limit = options.limit ?? ANALYTICS_QUERY_LIMIT;
  const partition = options.partition ?? null;
  const partitionValues = options.partitionValues ?? {};
  const offsetStart = options.offset ?? 0;
  const result: T[] = [];
  const seen = new Set<string>();

  if (typeof resource.query === 'function') {
    for (let offset = offsetStart;; offset += limit) {
      const [ok, queryErr, batch] = await tryFn(() =>
        resource.query!(normalizedFilter, { limit, offset, partition, partitionValues })
      ) as [boolean, Error | null, T[] | null];

      if (!ok || !Array.isArray(batch)) {
        if (queryErr && resource.list && isQueryUnsupportedError(queryErr)) {
          break;
        }

        throw new PluginError('Failed to query analytics records', {
          pluginName: 'EventualConsistencyPlugin',
          operation: 'queryResourceRecords',
          statusCode: 500,
          retriable: true,
          suggestion: 'Ensure query() is available for this analytics backend or remove filter/query dependencies.',
          resourceFilter: normalizedFilter,
          original: queryErr,
          listFallbackUnavailable: !resource.list
        });
      }

      const normalized = batch.filter((record) => recordsMatchFilter(record as Record<string, unknown>, normalizedFilter));
      for (const record of normalized) {
        pushUniqueRecord(result, seen, record);
      }

      if (batch.length < limit) {
        return result;
      }
    }
  }

  if (!resource.list) {
    return result;
  }

  for (let offset = offsetStart;; offset += limit) {
    const [ok, err, batch] = await tryFn(() =>
      resource.list!({ limit, offset })
    ) as [boolean, Error | null, T[] | null];

    if (!ok || !Array.isArray(batch)) {
      throw new PluginError('Failed to list analytics records', {
        pluginName: 'EventualConsistencyPlugin',
        operation: 'queryResourceRecords',
        statusCode: 500,
        retriable: true,
        suggestion: 'Verify resource permissions and list() availability.',
        resourceFilter: normalizedFilter,
        original: err
      });
    }

    const normalized = batch.filter((record) => recordsMatchFilter(record as Record<string, unknown>, normalizedFilter));
    for (const record of normalized) {
      pushUniqueRecord(result, seen, record);
    }

    if (batch.length < limit) {
      break;
    }
  }

  return result;
}

async function queryTransactionsByPeriod(
  transactionResource: TransactionResource,
  period: AnalyticsPeriod,
  cohort: string,
  options: QueryOptions = {},
  filter: Record<string, any> = { applied: true }
): Promise<Transaction[]> {
  const partitionConfig = ANALYTICS_TRANSACTION_PARTITION_BY_PERIOD[period];
  return queryResourceRecords<Transaction>(
    transactionResource,
    partitionConfig.filter(cohort, filter),
    {
      limit: options.limit,
      offset: options.offset,
      partition: partitionConfig.partition,
      partitionValues: partitionConfig.partitionValues(cohort, filter)
    }
  );
}

function getTransactionCohortField(period: AnalyticsPeriod): keyof Transaction {
  if (period === 'hour') return 'cohortHour';
  if (period === 'day') return 'cohortDate';
  if (period === 'week') return 'cohortWeek';
  return 'cohortMonth';
}

function enumerateDates(startDate: string, endDate: string): string[] {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const dates: string[] = [];

  for (let current = new Date(start); current <= end; current.setUTCDate(current.getUTCDate() + 1)) {
    dates.push(current.toISOString().substring(0, 10));
  }

  return dates;
}

function enumerateMonths(startMonth: string, endMonth: string): string[] {
  const startYear = parseInt(startMonth.substring(0, 4), 10);
  const startMonthValue = parseInt(startMonth.substring(5, 7), 10);
  const endYear = parseInt(endMonth.substring(0, 4), 10);
  const endMonthValue = parseInt(endMonth.substring(5, 7), 10);
  const months: string[] = [];

  for (let year = startYear; year <= endYear; year += 1) {
    const firstMonth = year === startYear ? startMonthValue : 1;
    const lastMonth = year === endYear ? endMonthValue : 12;

    for (let month = firstMonth; month <= lastMonth; month += 1) {
      months.push(`${year}-${String(month).padStart(2, '0')}`);
    }
  }

  return months;
}

function getMonthDateRange(month: string): { start: string; end: string } {
  const yearValue = parseInt(month.substring(0, 4), 10);
  const monthValue = parseInt(month.substring(5, 7), 10);
  const end = new Date(Date.UTC(yearValue, monthValue, 0)).toISOString().substring(0, 10);

  return {
    start: `${month}-01`,
    end
  };
}

function enumerateHours(startDate: string, endDate: string): string[] {
  const start = startDate.length > 10
    ? new Date(`${startDate}:00:00Z`)
    : new Date(`${startDate}T00:00:00Z`);
  const end = endDate.length > 10
    ? new Date(`${endDate}:00:00Z`)
    : new Date(`${endDate}T23:00:00Z`);
  const hours: string[] = [];

  for (let current = new Date(start); current <= end; current.setUTCHours(current.getUTCHours() + 1)) {
    hours.push(current.toISOString().substring(0, 13));
  }

  return hours;
}

function enumerateWeeks(startWeek: string, endWeek: string): string[] {
  const firstWeek = buildWeekStartDate(startWeek);
  const lastWeek = buildWeekStartDate(endWeek);
  if (!firstWeek || !lastWeek) {
    return [];
  }

  const weeks: string[] = [];
  for (let current = new Date(firstWeek); current <= lastWeek; current.setUTCDate(current.getUTCDate() + 7)) {
    const cohort = getCohortWeekFromDate(current);
    if (!weeks.includes(cohort)) {
      weeks.push(cohort);
    }
  }

  return weeks;
}

function getRequestedCohorts(
  period: AnalyticsPeriod,
  options: GetAnalyticsOptions | GetTopRecordsOptions
): string[] | null {
  const { date, startDate, endDate, month, year } = options as GetAnalyticsOptions;

  if (period === 'hour') {
    if (date) {
      return date.length > 10 ? [date] : enumerateHours(date, date);
    }
    if (month) {
      const range = getMonthDateRange(month);
      return enumerateHours(range.start, range.end);
    }
    if (startDate && endDate) {
      return enumerateHours(startDate, endDate);
    }
    return null;
  }

  if (period === 'day') {
    if (date) return [date];
    if (month) {
      const range = getMonthDateRange(month);
      return enumerateDates(range.start, range.end);
    }
    if (startDate && endDate) return enumerateDates(startDate, endDate);
    if (year) return enumerateDates(`${year}-01-01`, `${year}-12-31`);
    return null;
  }

  if (period === 'week') {
    if (date) return [date];
    if (startDate && endDate) return enumerateWeeks(startDate, endDate);
    if (year) return enumerateWeeks(`${year}-W01`, `${year}-W53`);
    return null;
  }

  if (date) return [date.substring(0, 7)];
  if (month) return [month];
  if (startDate && endDate) return enumerateMonths(startDate.substring(0, 7), endDate.substring(0, 7));
  if (year) return enumerateMonths(`${year}-01`, `${year}-12`);
  return null;
}

async function queryTransactionsForRequestedCohorts(
  transactionResource: TransactionResource,
  period: AnalyticsPeriod,
  cohorts: string[],
  filter: Record<string, any>
): Promise<Transaction[]> {
  const records: Transaction[] = [];
  const seen = new Set<string>();

  const { results } = await TasksPool.map(
    cohorts,
    async (cohort) => queryTransactionsByPeriod(transactionResource, period, cohort, {}, filter),
    { concurrency: ANALYTICS_READ_CONCURRENCY }
  );

  for (const batch of results) {
    if (!Array.isArray(batch)) continue;
    for (const transaction of batch) {
      pushUniqueRecord(records, seen, transaction);
    }
  }

  return records;
}

function filterTransactionsByOptions(
  transactions: Transaction[],
  period: AnalyticsPeriod,
  options: GetAnalyticsOptions | GetTopRecordsOptions
): Transaction[] {
  const { date, startDate, endDate, month, year } = options as GetAnalyticsOptions;
  const cohortField = getTransactionCohortField(period);

  return transactions.filter((transaction) => {
    const cohort = transaction[cohortField];
    if (typeof cohort !== 'string' || !cohort) {
      return false;
    }

    if (date) {
      if (period === 'hour' && date.length === 10) {
        return cohort.startsWith(date);
      }
      return cohort === date || cohort.startsWith(date);
    }

    if (startDate && endDate) {
      if (period === 'hour' && startDate.length === 10 && endDate.length === 10) {
        return cohort >= `${startDate}T00` && cohort <= `${endDate}T23`;
      }
      return cohort >= startDate && cohort <= endDate;
    }

    if (month) {
      return cohort.startsWith(month);
    }

    if (year) {
      return cohort.startsWith(String(year));
    }

    return true;
  });
}

async function queryTransactionsForAnalytics(
  transactionResource: TransactionResource,
  period: AnalyticsPeriod,
  options: GetAnalyticsOptions | GetTopRecordsOptions,
  filter: Record<string, any> = { applied: true }
): Promise<Transaction[]> {
  const requestedCohorts = getRequestedCohorts(period, options);

  const transactions = requestedCohorts && requestedCohorts.length > 0
    ? await queryTransactionsForRequestedCohorts(transactionResource, period, requestedCohorts, filter)
    : await queryResourceRecords<Transaction>(
        transactionResource,
        filter,
        {
          partition: 'byApplied',
          partitionValues: filter,
          limit: ANALYTICS_QUERY_LIMIT
        }
      );

  return filterTransactionsByOptions(transactions, period, options);
}

function buildWeekStartDate(weekCohort: string): Date | null {
  const match = /^(\d{4})-W(\d{2})$/.exec(weekCohort);
  if (!match) {
    return null;
  }

  const [, weekYear, weekNumber] = match;
  if (weekYear == null || weekNumber == null) {
    return null;
  }

  const year = parseInt(weekYear, 10);
  const week = parseInt(weekNumber, 10);

  if (Number.isNaN(year) || Number.isNaN(week) || week < 1 || week > 53) {
    return null;
  }

  const january4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = january4.getUTCDay() || 7;
  const mondayOfWeek1 = new Date(january4);
  mondayOfWeek1.setUTCDate(january4.getUTCDate() - dayOfWeek + 1);
  const targetDate = new Date(mondayOfWeek1);
  targetDate.setUTCDate(mondayOfWeek1.getUTCDate() + ((week - 1) * 7));

  return targetDate;
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
    const byHour = config.transactionResource ? null : groupByCohort(transactions, 'cohortHour');
    const now = new Date().toISOString();
    const affectedHours = new Set(
      transactions
        .map((transaction) => transaction.cohortHour)
        .filter((cohortHour): cohortHour is string => !!cohortHour)
    );
    const effectiveHours = (config.transactionResource && affectedHours.size > 0)
      ? Array.from(affectedHours)
      : Object.keys(byHour ?? {});

    await Promise.all(
      effectiveHours.map(async (cohort) => {
        const summary = config.transactionResource
          ? calculateAnalyticsStats(await getMaterializedHourlyTransactions(
              config.transactionResource,
              cohort,
              transactions
            ))
          : calculateAnalyticsStats((byHour as Record<string, Transaction[]> | null)?.[cohort] ?? []);
        const existing = await readAnalyticsRecord(analyticsResource, `hour-${cohort}`);
        await upsertAnalyticsForPeriod({
          id: `hour-${cohort}`,
          period: 'hour',
          cohort,
          existing,
          now,
          config,
          analyticsResource,
          replaceExisting: Boolean(config.transactionResource),
          summary
        });
      })
    );
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

async function getMaterializedHourlyTransactions(
  transactionResource: TransactionResource,
  cohortHour: string,
  transactions: Transaction[]
): Promise<Transaction[]> {
  const [storedAppliedTransactions, storedPendingTransactions] = await Promise.all([
    queryTransactionsByPeriod(
      transactionResource,
      'hour',
      cohortHour,
      {},
      { applied: true }
    ),
    queryTransactionsByPeriod(
      transactionResource,
      'hour',
      cohortHour,
      {},
      { applied: false }
    )
  ]);
  const storedTransactions = [...storedAppliedTransactions, ...storedPendingTransactions];
  const liveTransactions = transactions.filter((transaction) => transaction.cohortHour === cohortHour);
  const liveById = new Map(
    liveTransactions
      .filter((transaction): transaction is Transaction & { id: string } => typeof transaction.id === 'string')
      .map((transaction) => [
        transaction.id,
        {
          ...transaction,
          applied: true
        }
      ])
  );
  const staleCandidates = storedTransactions.filter((transaction) => {
    return typeof transaction.id === 'string' && !liveById.has(transaction.id);
  });
  const { results } = await TasksPool.map(
    staleCandidates,
    async (transaction) => {
      return transactionResource.get(transaction.id);
    },
    { concurrency: ANALYTICS_READ_CONCURRENCY }
  );
  const materialized: Transaction[] = [];
  const seen = new Set<string>();

  for (const storedTransaction of results) {
    if (!storedTransaction || typeof storedTransaction.id !== 'string' || seen.has(storedTransaction.id)) {
      continue;
    }
    seen.add(storedTransaction.id);
    materialized.push(storedTransaction);
  }

  for (const liveTransaction of liveById.values()) {
    if (typeof liveTransaction.id !== 'string' || seen.has(liveTransaction.id)) {
      continue;
    }
    seen.add(liveTransaction.id);
    materialized.push(liveTransaction);
  }

  return materialized.filter((transaction) => transaction.applied === true);
}

/**
 * Upsert analytics for a specific period and cohort
 */
async function upsertAnalyticsForPeriod({
  id,
  period,
  cohort,
  existing,
  now,
  config,
  summary,
  analyticsResource,
  replaceExisting
}: UpsertAnalyticsDependencies): Promise<void> {
  await upsertAnalyticsForSummary({
    id,
    period,
    cohort,
    existing,
    now,
    config,
    summary,
    analyticsResource,
    replaceExisting
  });
}

async function upsertAnalyticsForSummary({
  id,
  period,
  cohort,
  existing,
  now,
  config,
  summary,
  analyticsResource,
  replaceExisting
}: UpsertAnalyticsSummaryDependencies): Promise<void> {
  if (summary.transactionCount === 0) return;

  let attempt = 0;
  let current = existing ? { ...existing } : null;
  const basePayload = {
    field: config.field,
    period,
    cohort,
    ...summary,
    consolidatedAt: now,
    updatedAt: now
  };

  while (attempt < MAX_ANALYTICS_UPDATE_RETRIES) {
    attempt += 1;
    let mergedData: Partial<AnalyticsRecordWithEtag> | null = null;

    if (!current) {
      const [insertOk] = await tryFn(() =>
        analyticsResource.insert({
          id,
          ...basePayload
        })
      ) as [boolean, Error | null, AnalyticsRecord | null];

      if (insertOk) return;

      current = await readAnalyticsRecord(analyticsResource, id);
      if (!current) {
        continue;
      }
    }

    mergedData = replaceExisting
      ? {
          ...basePayload
        }
      : buildMergedAnalytics(current, summary, now);

    const [updated, , updateResult] = await tryUpdateAnalytics(
      analyticsResource,
      id,
      current._etag,
      mergedData
    );

    if (updated) return;

    if (current) {
      if (attempt >= MAX_ANALYTICS_UPDATE_RETRIES) {
        break;
      }

      if (updateResult?.error) {
        current = null;
      }

      const refreshed = await readAnalyticsRecord(analyticsResource, id);
      current = refreshed;
      continue;
    }

    const freshCurrent = await readAnalyticsRecord(analyticsResource, id);
    if (!freshCurrent) {
      continue;
    }

    current = freshCurrent;
  }

  throw new Error(`Failed to upsert analytics record ${id} after ${MAX_ANALYTICS_UPDATE_RETRIES} attempts`);
}

function calculateAnalyticsStats(transactions: Transaction[]): AnalyticsStats {
  const transactionCount = transactions.length;
  const signedValues = transactions.map((transaction) => {
    return transaction.operation === 'sub' ? -transaction.value : transaction.value;
  });

  const totalValue = signedValues.reduce((sum, v) => sum + v, 0);
  const avgValue = totalValue / transactionCount;
  const minValue = Math.min(...signedValues);
  const maxValue = Math.max(...signedValues);
  const operations = calculateOperationBreakdown(transactions);
  const recordCount = calculateRecordCountFromTransactions(transactions);

  return {
    transactionCount,
    totalValue,
    avgValue,
    minValue,
    maxValue,
    operations,
    recordCount
  };
}

async function readAnalyticsRecord(
  analyticsResource: AnalyticsResource,
  id: string
): Promise<AnalyticsRecordWithEtag | null> {
  const [ok, , analytics] = await tryFn(() =>
    analyticsResource.get(id)
  ) as [boolean, Error | null, AnalyticsRecordWithEtag | null];

  if (!ok || !analytics) {
    return null;
  }

  return analytics;
}

async function tryUpdateAnalytics(
  analyticsResource: AnalyticsResource,
  id: string,
  etag: string | undefined,
  mergedData: Partial<AnalyticsRecord>
): Promise<[boolean, Error | null, { success: boolean; error?: string } | null]> {
  const resource = analyticsResource as UpdatableAnalyticsResource;

  if (typeof etag === 'string' && typeof resource.updateConditional === 'function') {
    const [ok, err, result] = await tryFn(() =>
      resource.updateConditional!(id, mergedData, { ifMatch: etag })
    ) as [boolean, Error | null, { success: boolean; error?: string; data?: AnalyticsRecord } | null];

    if (ok) {
      return [result?.success === true, null, result ?? null];
    }

    return [false, err, null];
  }

  const [ok, err] = await tryFn(() =>
    analyticsResource.update(id, mergedData)
  ) as [boolean, Error | null, AnalyticsRecord | null];

  return [ok, err, ok ? { success: true } : null];
}

function buildMergedAnalytics(existing: AnalyticsRecordWithEtag, stats: AnalyticsStats, now: string): Partial<AnalyticsRecordWithEtag> {
  const newTransactionCount = existing.transactionCount + stats.transactionCount;
  const newTotalValue = existing.totalValue + stats.totalValue;

  const newOperations: OperationBreakdown = { ...existing.operations };
  for (const [op, operationStats] of Object.entries(stats.operations)) {
    if (!newOperations[op]) {
      newOperations[op] = { count: 0, sum: 0 };
    }
    newOperations[op].count += operationStats.count;
    newOperations[op].sum += operationStats.sum;
  }

  return {
    transactionCount: newTransactionCount,
    totalValue: newTotalValue,
    avgValue: newTotalValue / newTransactionCount,
    minValue: Math.min(existing.minValue, stats.minValue),
    maxValue: Math.max(existing.maxValue, stats.maxValue),
    operations: newOperations,
    recordCount: existing.recordCount + stats.recordCount,
    updatedAt: now
  };
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
async function queryAnalyticsRecords(
  analyticsResource: AnalyticsResource,
  filter: Record<string, any>,
  options: QueryOptions = {}
): Promise<AnalyticsRecord[]> {
  return queryResourceRecords<AnalyticsRecord>(analyticsResource as QueryableResource<AnalyticsRecord>, filter, options);
}

function recordsMatchFilter(record: Record<string, unknown>, filter: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([key, value]) => record[key] === value);
}

async function rollupPeriod(
  period: string,
  cohort: string,
  sourcePrefix: string,
  analyticsResource: AnalyticsResource,
  config: UpdateAnalyticsConfig
): Promise<void> {
  let summary: AnalyticsStats;
  if (config.transactionResource) {
    summary = calculateAnalyticsStats(
      await queryTransactionsByPeriod(config.transactionResource, period as AnalyticsPeriod, cohort)
    );
  } else {
    const sourcePeriod = (() => {
      if (period === 'day') return 'hour';
      if (period === 'week') return 'day';
      if (period === 'month') return 'day';
      return 'day';
    })();

    const sourceAnalytics = await queryAnalyticsRecords(
      analyticsResource,
      { period: sourcePeriod },
      { partition: 'byPeriod', partitionValues: { period: sourcePeriod }, limit: ANALYTICS_QUERY_LIMIT }
    );

    const filteredAnalytics = sourceAnalytics.filter((analyticsRecord) => {
      if (period === 'week') {
        const dayDate = new Date(analyticsRecord.cohort);
        const dayWeek = getCohortWeekFromDate(dayDate);
        return dayWeek === cohort;
      }
      return analyticsRecord.cohort.startsWith(sourcePrefix);
    });

    if (filteredAnalytics.length === 0) return;

    const transactionCount = filteredAnalytics.reduce((sum, a) => sum + a.transactionCount, 0);
    const totalValue = filteredAnalytics.reduce((sum, a) => sum + a.totalValue, 0);
    const avgValue = totalValue / transactionCount;
    const minValue = Math.min(...filteredAnalytics.map(a => a.minValue));
    const maxValue = Math.max(...filteredAnalytics.map(a => a.maxValue));

    const operations: OperationBreakdown = {};
    for (const analytics of filteredAnalytics) {
      for (const [op, stats] of Object.entries(analytics.operations || {})) {
        if (!operations[op]) {
          operations[op] = { count: 0, sum: 0 };
        }
        operations[op].count += stats.count;
        operations[op].sum += stats.sum;
      }
    }

    const recordCount = filteredAnalytics.reduce((sum, a) => sum + a.recordCount, 0);

    summary = {
      transactionCount,
      totalValue,
      avgValue: Number.isFinite(avgValue) ? avgValue : 0,
      minValue,
      maxValue,
      operations,
      recordCount
    };
  }

  if (summary.transactionCount === 0) {
    return;
  }

  const id = `${period}-${cohort}`;
  const now = new Date().toISOString();
  const existing = await readAnalyticsRecord(analyticsResource, id);

  await upsertAnalyticsForSummary({
    id,
    period,
    cohort,
    existing,
    now,
    config,
    analyticsResource,
    summary,
    replaceExisting: true
  });
}

/**
 * Fill gaps in analytics data with zeros for continuous time series
 *
 * @param data - Sparse analytics data
 * @param period - Period type ('hour', 'day', 'week', 'month')
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
  } else if (period === 'week') {
    const firstWeek = buildWeekStartDate(startDate);
    const lastWeek = buildWeekStartDate(endDate);

    if (!firstWeek || !lastWeek) {
      return result;
    }

    for (let dt = new Date(firstWeek); dt <= lastWeek; dt.setDate(dt.getDate() + 7)) {
      const cohort = getCohortWeekFromDate(dt);
      result.push(dataMap.get(cohort) || { cohort, ...emptyRecord });
    }
  }

  return result;
}

function formatAnalyticsData(
  data: AnalyticsDataPoint[],
  breakdown: GetAnalyticsOptions['breakdown']
): AnalyticsDataPoint[] {
  if (breakdown === 'operations') {
    return data.map((point) => ({
      cohort: point.cohort,
      count: point.count,
      sum: point.sum,
      avg: point.avg,
      min: point.min,
      max: point.max,
      recordCount: point.recordCount,
      ...(point.operations || {})
    }));
  }

  return data.map((point) => ({
    cohort: point.cohort,
    count: point.count,
    sum: point.sum,
    avg: point.avg,
    min: point.min,
    max: point.max,
    operations: point.operations,
    recordCount: point.recordCount
  }));
}

async function getHourlyAnalyticsData(
  handler: FieldHandler,
  options: GetAnalyticsOptions
): Promise<AnalyticsDataPoint[]> {
  const { date, startDate, endDate, month, year, breakdown = false } = options;
  const analyticsResource = handler.analyticsResource!;
  const queryOptions: QueryOptions = {
    limit: ANALYTICS_QUERY_LIMIT,
    partition: 'byPeriod',
    partitionValues: { period: 'hour' }
  };
  const hourFilter: Record<string, any> = { period: 'hour' };

  if (date && date.length > 10) {
    queryOptions.partition = 'byPeriodCohort';
    queryOptions.partitionValues = { period: 'hour', cohort: date };
    hourFilter.cohort = date;
  }

  const allAnalytics = await queryAnalyticsRecords(
    analyticsResource,
    hourFilter,
    queryOptions
  );

  let filtered = allAnalytics.filter((analyticsRecord) => analyticsRecord.period === 'hour');

  if (date) {
    filtered = filtered.filter((analyticsRecord) => analyticsRecord.cohort.startsWith(date));
  } else if (startDate && endDate) {
    const startHour = startDate.length > 10 ? startDate : `${startDate}T00`;
    const endHour = endDate.length > 10 ? endDate : `${endDate}T23`;
    filtered = filtered.filter((analyticsRecord) => analyticsRecord.cohort >= startHour && analyticsRecord.cohort <= endHour);
  } else if (month) {
    filtered = filtered.filter((analyticsRecord) => analyticsRecord.cohort.startsWith(month));
  } else if (year) {
    filtered = filtered.filter((analyticsRecord) => analyticsRecord.cohort.startsWith(String(year)));
  }

  const storedData: AnalyticsDataPoint[] = filtered.map((analyticsRecord) => ({
    cohort: analyticsRecord.cohort,
    count: analyticsRecord.transactionCount,
    sum: analyticsRecord.totalValue,
    avg: analyticsRecord.avgValue,
    min: analyticsRecord.minValue,
    max: analyticsRecord.maxValue,
    operations: analyticsRecord.operations || {},
    recordCount: analyticsRecord.recordCount
  }));

  if (handler.transactionResource) {
    const requestedCohorts = getRequestedCohorts('hour', options);

    if (requestedCohorts && requestedCohorts.length > 0) {
      const presentCohorts = new Set(storedData.map((point) => point.cohort));
      const missingCohorts = requestedCohorts.filter((cohort) => !presentCohorts.has(cohort));

      if (missingCohorts.length > 0) {
        const fallbackTransactions = await queryTransactionsForRequestedCohorts(
          handler.transactionResource,
          'hour',
          missingCohorts,
          { applied: true }
        );
        storedData.push(...aggregateTransactionsByCohort(fallbackTransactions, 'cohortHour'));
      }
    } else if (storedData.length === 0) {
      const fallbackTransactions = await queryTransactionsForAnalytics(handler.transactionResource, 'hour', options, { applied: true });
      storedData.push(...aggregateTransactionsByCohort(fallbackTransactions, 'cohortHour'));
    }
  }

  storedData.sort((a, b) => a.cohort.localeCompare(b.cohort));
  return formatAnalyticsData(storedData, breakdown);
}

async function getLazyAggregatedAnalytics(
  handler: FieldHandler,
  period: Exclude<AnalyticsPeriod, 'hour'>,
  options: GetAnalyticsOptions
): Promise<AnalyticsDataPoint[]> {
  if (!handler.transactionResource) {
    return [];
  }

  const transactions = await queryTransactionsForAnalytics(handler.transactionResource, period, options, { applied: true });
  const aggregated = aggregateTransactionsByCohort(
    transactions,
    getTransactionCohortField(period)
  );

  return formatAnalyticsData(aggregated, options.breakdown);
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

  const normalizedOptions = {
    period,
    date,
    startDate,
    endDate,
    month,
    year,
    breakdown
  };

  if (period === 'hour') {
    return getHourlyAnalyticsData(handler, normalizedOptions);
  }

  return getLazyAggregatedAnalytics(
    handler,
    period,
    normalizedOptions
  );
}

/**
 * Get analytics for a specific record from transactions
 */
async function getAnalyticsForRecord(
  _resourceName: string,
  _fieldName: string,
  recordId: string,
  options: GetAnalyticsOptions,
  handler: FieldHandler
): Promise<AnalyticsDataPoint[]> {
  const { period = 'day', date, startDate, endDate, month, year } = options;

  const [okTrue, , appliedTransactions] = await tryFn(() =>
    handler.transactionResource!.query({
      originalId: recordId,
      applied: true
    })
  ) as [boolean, Error | null, Transaction[] | null];

  const [okFalse, , pendingTransactions] = await tryFn(() =>
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
    } else if (period === 'week') {
      filtered = filtered.filter(t => t.cohortWeek === date);
    } else if (period === 'month') {
      filtered = filtered.filter(t => t.cohortMonth && t.cohortMonth.startsWith(date));
    }
  } else if (startDate && endDate) {
    if (period === 'hour') {
      filtered = filtered.filter(t => t.cohortHour && t.cohortHour >= startDate && t.cohortHour <= endDate);
    } else if (period === 'day') {
      filtered = filtered.filter(t => t.cohortDate && t.cohortDate >= startDate && t.cohortDate <= endDate);
    } else if (period === 'week') {
      filtered = filtered.filter(t => t.cohortWeek && t.cohortWeek >= startDate && t.cohortWeek <= endDate);
    } else if (period === 'month') {
      filtered = filtered.filter(t => t.cohortMonth && t.cohortMonth >= startDate && t.cohortMonth <= endDate);
    }
  } else if (month) {
    if (period === 'hour') {
      filtered = filtered.filter(t => t.cohortHour && t.cohortHour.startsWith(month));
    } else if (period === 'day') {
      filtered = filtered.filter(t => t.cohortDate && t.cohortDate.startsWith(month));
    } else if (period === 'week') {
      filtered = filtered.filter(t => t.cohortWeek && t.cohortWeek.startsWith(month));
    }
  } else if (year) {
    if (period === 'hour') {
      filtered = filtered.filter(t => t.cohortHour && t.cohortHour.startsWith(String(year)));
    } else if (period === 'day') {
      filtered = filtered.filter(t => t.cohortDate && t.cohortDate.startsWith(String(year)));
    } else if (period === 'week') {
      filtered = filtered.filter(t => t.cohortWeek && t.cohortWeek.startsWith(String(year)));
    } else if (period === 'month') {
      filtered = filtered.filter(t => t.cohortMonth && t.cohortMonth.startsWith(String(year)));
    }
  }

  const cohortField = period === 'hour' ? 'cohortHour' : period === 'day' ? 'cohortDate' : period === 'week' ? 'cohortWeek' : 'cohortMonth';
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
  const [appliedTransactions, pendingTransactions] = await Promise.all([
    queryTransactionsForAnalytics(handler.transactionResource!, period, { date }, { applied: true }),
    queryTransactionsForAnalytics(handler.transactionResource!, period, { date }, { applied: false })
  ]);
  const filtered = [...appliedTransactions, ...pendingTransactions];

  const byRecord: Record<string, { count: number; sum: number }> = {};
  for (const txn of filtered) {
    const recordId = txn.originalId;
    if (!byRecord[recordId]) {
      byRecord[recordId] = { count: 0, sum: 0 };
    }
    byRecord[recordId].count++;
    byRecord[recordId].sum += txn.operation === 'sub' ? -txn.value : txn.value;
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
