/**
 * Analytics for EventualConsistencyPlugin
 * @module eventual-consistency/analytics
 */

import tryFn from "../../concerns/try-fn.js";
import { groupByCohort } from "./utils.js";

/**
 * Update analytics with consolidated transactions
 *
 * @param {Array} transactions - Transactions that were just consolidated
 * @param {Object} analyticsResource - Analytics resource
 * @param {Object} config - Plugin configuration
 * @returns {Promise<void>}
 */
export async function updateAnalytics(transactions, analyticsResource, config) {
  if (!analyticsResource || transactions.length === 0) return;

  // CRITICAL VALIDATION: Ensure field is set in config
  // This can be undefined due to race conditions when multiple handlers share config
  if (!config.field) {
    throw new Error(
      `[EventualConsistency] CRITICAL BUG: config.field is undefined in updateAnalytics()!\n` +
      `This indicates a race condition in the plugin where multiple handlers are sharing the same config object.\n` +
      `Config: ${JSON.stringify({ resource: config.resource, field: config.field })}\n` +
      `Transactions count: ${transactions.length}\n` +
      `AnalyticsResource: ${analyticsResource?.name || 'unknown'}`
    );
  }

  if (config.verbose) {
    console.log(
      `[EventualConsistency] ${config.resource}.${config.field} - ` +
      `Updating analytics for ${transactions.length} transactions...`
    );
  }

  try {
    // Group transactions by cohort hour
    const byHour = groupByCohort(transactions, 'cohortHour');
    const cohortCount = Object.keys(byHour).length;

    if (config.verbose) {
      console.log(
        `[EventualConsistency] ${config.resource}.${config.field} - ` +
        `Updating ${cohortCount} hourly analytics cohorts IN PARALLEL...`
      );
    }

    // ✅ OTIMIZAÇÃO: Update hourly analytics EM PARALELO
    await Promise.all(
      Object.entries(byHour).map(([cohort, txns]) =>
        upsertAnalytics('hour', cohort, txns, analyticsResource, config)
      )
    );

    // Roll up to daily and monthly if configured
    if (config.analyticsConfig.rollupStrategy === 'incremental') {
      const uniqueHours = Object.keys(byHour);

      if (config.verbose) {
        console.log(
          `[EventualConsistency] ${config.resource}.${config.field} - ` +
          `Rolling up ${uniqueHours.length} hours to daily/weekly/monthly analytics IN PARALLEL...`
        );
      }

      // ✅ OTIMIZAÇÃO: Rollup analytics EM PARALELO
      await Promise.all(
        uniqueHours.map(cohortHour =>
          rollupAnalytics(cohortHour, analyticsResource, config)
        )
      );
    }

    if (config.verbose) {
      console.log(
        `[EventualConsistency] ${config.resource}.${config.field} - ` +
        `Analytics update complete for ${cohortCount} cohorts`
      );
    }
  } catch (error) {
    console.error(
      `[EventualConsistency] CRITICAL: ${config.resource}.${config.field} - ` +
      `Analytics update failed:`,
      {
        error: error.message,
        stack: error.stack,
        field: config.field,
        resource: config.resource,
        transactionCount: transactions.length
      }
    );
    // Re-throw to prevent silent failures
    throw new Error(
      `Analytics update failed for ${config.resource}.${config.field}: ${error.message}`
    );
  }
}

/**
 * Upsert analytics for a specific period and cohort
 * @private
 */
async function upsertAnalytics(period, cohort, transactions, analyticsResource, config) {
  const id = `${period}-${cohort}`;

  // Calculate metrics
  const transactionCount = transactions.length;

  // Calculate signed values (considering operation type)
  const signedValues = transactions.map(t => {
    if (t.operation === 'sub') return -t.value;
    return t.value;
  });

  const totalValue = signedValues.reduce((sum, v) => sum + v, 0);
  const avgValue = totalValue / transactionCount;
  const minValue = Math.min(...signedValues);
  const maxValue = Math.max(...signedValues);

  // Calculate operation breakdown
  const operations = calculateOperationBreakdown(transactions);

  // Count distinct records
  const recordCount = new Set(transactions.map(t => t.originalId)).size;

  const now = new Date().toISOString();

  // Try to get existing analytics
  const [existingOk, existingErr, existing] = await tryFn(() =>
    analyticsResource.get(id)
  );

  if (existingOk && existing) {
    // Update existing analytics (incremental)
    const newTransactionCount = existing.transactionCount + transactionCount;
    const newTotalValue = existing.totalValue + totalValue;
    const newAvgValue = newTotalValue / newTransactionCount;
    const newMinValue = Math.min(existing.minValue, minValue);
    const newMaxValue = Math.max(existing.maxValue, maxValue);

    // Merge operation breakdown
    const newOperations = { ...existing.operations };
    for (const [op, stats] of Object.entries(operations)) {
      if (!newOperations[op]) {
        newOperations[op] = { count: 0, sum: 0 };
      }
      newOperations[op].count += stats.count;
      newOperations[op].sum += stats.sum;
    }

    // Update record count (approximate - we don't track all unique IDs)
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
    // Create new analytics
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
 * @private
 */
function calculateOperationBreakdown(transactions) {
  const breakdown = {};

  for (const txn of transactions) {
    const op = txn.operation;
    if (!breakdown[op]) {
      breakdown[op] = { count: 0, sum: 0 };
    }
    breakdown[op].count++;

    // Use signed value for sum (sub operations are negative)
    const signedValue = op === 'sub' ? -txn.value : txn.value;
    breakdown[op].sum += signedValue;
  }

  return breakdown;
}

/**
 * Roll up hourly analytics to daily, weekly, and monthly
 * @private
 */
async function rollupAnalytics(cohortHour, analyticsResource, config) {
  // cohortHour format: '2025-10-09T14'
  const cohortDate = cohortHour.substring(0, 10); // '2025-10-09'
  const cohortMonth = cohortHour.substring(0, 7);  // '2025-10'

  // Calculate week cohort (ISO 8601 format)
  const date = new Date(cohortDate);
  const cohortWeek = getCohortWeekFromDate(date);

  // Roll up to day
  await rollupPeriod('day', cohortDate, cohortDate, analyticsResource, config);

  // Roll up to week
  await rollupPeriod('week', cohortWeek, cohortWeek, analyticsResource, config);

  // Roll up to month
  await rollupPeriod('month', cohortMonth, cohortMonth, analyticsResource, config);
}

/**
 * Get cohort week string from a date
 * @private
 */
function getCohortWeekFromDate(date) {
  // ISO week calculation (use UTC methods)
  const target = new Date(date.valueOf());
  const dayNr = (date.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);

  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const firstThursday = new Date(yearStart.valueOf());
  if (yearStart.getUTCDay() !== 4) {
    firstThursday.setUTCDate(yearStart.getUTCDate() + ((4 - yearStart.getUTCDay()) + 7) % 7);
  }

  const weekNumber = 1 + Math.round((target - firstThursday) / 604800000);
  const weekYear = target.getUTCFullYear();

  return `${weekYear}-W${String(weekNumber).padStart(2, '0')}`;
}

/**
 * Roll up analytics for a specific period
 * @private
 */
async function rollupPeriod(period, cohort, sourcePrefix, analyticsResource, config) {
  // Get all source analytics (e.g., all hours for a day, all days for a week)
  let sourcePeriod;
  if (period === 'day') {
    sourcePeriod = 'hour';
  } else if (period === 'week') {
    sourcePeriod = 'day';  // Week aggregates from days
  } else if (period === 'month') {
    sourcePeriod = 'day';  // ✅ Month aggregates from days AND hours (like week)
  } else {
    sourcePeriod = 'day'; // Fallback
  }

  const [ok, err, allAnalytics] = await tryFn(() =>
    analyticsResource.list()
  );

  if (!ok || !allAnalytics) return;

  // Filter to matching cohorts
  let sourceAnalytics;
  if (period === 'week') {
    // For week, we need to find all days that belong to this week
    sourceAnalytics = allAnalytics.filter(a => {
      if (a.period !== sourcePeriod) return false;
      // Check if this day's cohort belongs to the target week
      const dayDate = new Date(a.cohort);
      const dayWeek = getCohortWeekFromDate(dayDate);
      return dayWeek === cohort;
    });
  } else {
    // For day and month, simple prefix matching works
    // day: aggregates from hours (cohort '2025-10-09' matches '2025-10-09T14', '2025-10-09T15', etc)
    // month: aggregates from days (cohort '2025-10' matches '2025-10-01', '2025-10-02', etc)
    sourceAnalytics = allAnalytics.filter(a =>
      a.period === sourcePeriod && a.cohort.startsWith(sourcePrefix)
    );
  }

  if (sourceAnalytics.length === 0) return;

  // Aggregate metrics
  const transactionCount = sourceAnalytics.reduce((sum, a) => sum + a.transactionCount, 0);
  const totalValue = sourceAnalytics.reduce((sum, a) => sum + a.totalValue, 0);
  const avgValue = totalValue / transactionCount;
  const minValue = Math.min(...sourceAnalytics.map(a => a.minValue));
  const maxValue = Math.max(...sourceAnalytics.map(a => a.maxValue));

  // Merge operation breakdown
  const operations = {};
  for (const analytics of sourceAnalytics) {
    for (const [op, stats] of Object.entries(analytics.operations || {})) {
      if (!operations[op]) {
        operations[op] = { count: 0, sum: 0 };
      }
      operations[op].count += stats.count;
      operations[op].sum += stats.sum;
    }
  }

  // Approximate record count (max of all periods)
  const recordCount = Math.max(...sourceAnalytics.map(a => a.recordCount));

  const id = `${period}-${cohort}`;
  const now = new Date().toISOString();

  // Upsert rolled-up analytics
  const [existingOk, existingErr, existing] = await tryFn(() =>
    analyticsResource.get(id)
  );

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
 * @param {Array} data - Sparse analytics data
 * @param {string} period - Period type ('hour', 'day', 'month')
 * @param {string} startDate - Start date (ISO format)
 * @param {string} endDate - End date (ISO format)
 * @returns {Array} Complete time series with gaps filled
 */
export function fillGaps(data, period, startDate, endDate) {
  if (!data || data.length === 0) {
    // If no data, still generate empty series
    data = [];
  }

  // Create a map of existing data by cohort
  const dataMap = new Map();
  data.forEach(item => {
    dataMap.set(item.cohort, item);
  });

  const result = [];
  const emptyRecord = {
    count: 0,
    sum: 0,
    avg: 0,
    min: 0,
    max: 0,
    recordCount: 0
  };

  if (period === 'hour') {
    // Generate all hours between startDate and endDate
    const start = new Date(startDate + 'T00:00:00Z');
    const end = new Date(endDate + 'T23:59:59Z');

    for (let dt = new Date(start); dt <= end; dt.setHours(dt.getHours() + 1)) {
      const cohort = dt.toISOString().substring(0, 13); // YYYY-MM-DDTHH
      result.push(dataMap.get(cohort) || { cohort, ...emptyRecord });
    }
  } else if (period === 'day') {
    // Generate all days between startDate and endDate
    const start = new Date(startDate);
    const end = new Date(endDate);

    for (let dt = new Date(start); dt <= end; dt.setDate(dt.getDate() + 1)) {
      const cohort = dt.toISOString().substring(0, 10); // YYYY-MM-DD
      result.push(dataMap.get(cohort) || { cohort, ...emptyRecord });
    }
  } else if (period === 'month') {
    // Generate all months between startDate and endDate
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
 * @param {string} resourceName - Resource name
 * @param {string} field - Field name
 * @param {Object} options - Query options
 * @param {Object} fieldHandlers - Field handlers map
 * @returns {Promise<Array>} Analytics data
 */
export async function getAnalytics(resourceName, field, options, fieldHandlers) {
  // Get handler for this resource/field combination
  const resourceHandlers = fieldHandlers.get(resourceName);
  if (!resourceHandlers) {
    throw new Error(`No eventual consistency configured for resource: ${resourceName}`);
  }

  const handler = resourceHandlers.get(field);
  if (!handler) {
    throw new Error(`No eventual consistency configured for field: ${resourceName}.${field}`);
  }

  if (!handler.analyticsResource) {
    throw new Error('Analytics not enabled for this plugin');
  }

  const { period = 'day', date, startDate, endDate, month, year, breakdown = false } = options;

  const [ok, err, allAnalytics] = await tryFn(() =>
    handler.analyticsResource.list()
  );

  if (!ok || !allAnalytics) {
    return [];
  }

  // Filter by period
  let filtered = allAnalytics.filter(a => a.period === period);

  // Filter by date/range
  if (date) {
    if (period === 'hour') {
      // Match all hours of the date
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

  // Sort by cohort
  filtered.sort((a, b) => a.cohort.localeCompare(b.cohort));

  // Return with or without breakdown
  if (breakdown === 'operations') {
    return filtered.map(a => ({
      cohort: a.cohort,
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
 * Get analytics for entire month, broken down by days
 *
 * @param {string} resourceName - Resource name
 * @param {string} field - Field name
 * @param {string} month - Month in YYYY-MM format
 * @param {Object} options - Options
 * @param {Object} fieldHandlers - Field handlers map
 * @returns {Promise<Array>} Daily analytics for the month
 */
export async function getMonthByDay(resourceName, field, month, options, fieldHandlers) {
  // month format: '2025-10'
  const year = parseInt(month.substring(0, 4));
  const monthNum = parseInt(month.substring(5, 7));

  // Get first and last day of month
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
    return fillGaps(data, 'day', startDate, endDate);
  }

  return data;
}

/**
 * Get analytics for entire day, broken down by hours
 *
 * @param {string} resourceName - Resource name
 * @param {string} field - Field name
 * @param {string} date - Date in YYYY-MM-DD format
 * @param {Object} options - Options
 * @param {Object} fieldHandlers - Field handlers map
 * @returns {Promise<Array>} Hourly analytics for the day
 */
export async function getDayByHour(resourceName, field, date, options, fieldHandlers) {
  // date format: '2025-10-09'
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
 *
 * @param {string} resourceName - Resource name
 * @param {string} field - Field name
 * @param {number} days - Number of days to look back (default: 7)
 * @param {Object} options - Options
 * @param {Object} fieldHandlers - Field handlers map
 * @returns {Promise<Array>} Daily analytics
 */
export async function getLastNDays(resourceName, field, days, options, fieldHandlers) {
  const dates = Array.from({ length: days }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - i);
    return date.toISOString().substring(0, 10);
  }).reverse();

  const data = await getAnalytics(resourceName, field, {
    period: 'day',
    startDate: dates[0],
    endDate: dates[dates.length - 1]
  }, fieldHandlers);

  if (options.fillGaps) {
    return fillGaps(data, 'day', dates[0], dates[dates.length - 1]);
  }

  return data;
}

/**
 * Get analytics for entire year, broken down by months
 *
 * @param {string} resourceName - Resource name
 * @param {string} field - Field name
 * @param {number} year - Year (e.g., 2025)
 * @param {Object} options - Options
 * @param {Object} fieldHandlers - Field handlers map
 * @returns {Promise<Array>} Monthly analytics for the year
 */
export async function getYearByMonth(resourceName, field, year, options, fieldHandlers) {
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
 *
 * @param {string} resourceName - Resource name
 * @param {string} field - Field name
 * @param {number} year - Year (e.g., 2025)
 * @param {Object} options - Options
 * @param {Object} fieldHandlers - Field handlers map
 * @returns {Promise<Array>} Weekly analytics for the year (up to 53 weeks)
 */
export async function getYearByWeek(resourceName, field, year, options, fieldHandlers) {
  const data = await getAnalytics(resourceName, field, {
    period: 'week',
    year
  }, fieldHandlers);

  // Week data doesn't need gap filling as much as daily/hourly
  // But we can still provide it if requested
  if (options.fillGaps) {
    // ISO weeks: typically 52-53 weeks per year
    const startWeek = `${year}-W01`;
    const endWeek = `${year}-W53`;
    return fillGaps(data, 'week', startWeek, endWeek);
  }

  return data;
}

/**
 * Get analytics for entire month, broken down by weeks
 *
 * @param {string} resourceName - Resource name
 * @param {string} field - Field name
 * @param {string} month - Month in YYYY-MM format
 * @param {Object} options - Options
 * @param {Object} fieldHandlers - Field handlers map
 * @returns {Promise<Array>} Weekly analytics for the month
 */
export async function getMonthByWeek(resourceName, field, month, options, fieldHandlers) {
  // month format: '2025-10'
  const year = parseInt(month.substring(0, 4));
  const monthNum = parseInt(month.substring(5, 7));

  // Get first and last day of month
  const firstDay = new Date(year, monthNum - 1, 1);
  const lastDay = new Date(year, monthNum, 0);

  // Find which weeks this month spans
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
 *
 * @param {string} resourceName - Resource name
 * @param {string} field - Field name
 * @param {string} month - Month in YYYY-MM format (or 'last' for previous month)
 * @param {Object} options - Options
 * @param {Object} fieldHandlers - Field handlers map
 * @returns {Promise<Array>} Hourly analytics for the month (up to 24*31=744 records)
 */
export async function getMonthByHour(resourceName, field, month, options, fieldHandlers) {
  // month format: '2025-10' or 'last'
  let year, monthNum;

  if (month === 'last') {
    const now = new Date();
    now.setMonth(now.getMonth() - 1);
    year = now.getFullYear();
    monthNum = now.getMonth() + 1;
  } else {
    year = parseInt(month.substring(0, 4));
    monthNum = parseInt(month.substring(5, 7));
  }

  // Get first and last day of month
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

/**
 * Get top records by volume
 *
 * @param {string} resourceName - Resource name
 * @param {string} field - Field name
 * @param {Object} options - Query options
 * @param {Object} fieldHandlers - Field handlers map
 * @returns {Promise<Array>} Top records
 */
export async function getTopRecords(resourceName, field, options, fieldHandlers) {
  // Get handler for this resource/field combination
  const resourceHandlers = fieldHandlers.get(resourceName);
  if (!resourceHandlers) {
    throw new Error(`No eventual consistency configured for resource: ${resourceName}`);
  }

  const handler = resourceHandlers.get(field);
  if (!handler) {
    throw new Error(`No eventual consistency configured for field: ${resourceName}.${field}`);
  }

  if (!handler.transactionResource) {
    throw new Error('Transaction resource not initialized');
  }

  const { period = 'day', date, metric = 'transactionCount', limit = 10 } = options;

  // Get all transactions for the period
  const [ok, err, transactions] = await tryFn(() =>
    handler.transactionResource.list()
  );

  if (!ok || !transactions) {
    return [];
  }

  // Filter by date
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

  // Group by originalId
  const byRecord = {};
  for (const txn of filtered) {
    const recordId = txn.originalId;
    if (!byRecord[recordId]) {
      byRecord[recordId] = { count: 0, sum: 0 };
    }
    byRecord[recordId].count++;
    byRecord[recordId].sum += txn.value;
  }

  // Convert to array and sort
  const records = Object.entries(byRecord).map(([recordId, stats]) => ({
    recordId,
    count: stats.count,
    sum: stats.sum
  }));

  // Sort by metric
  records.sort((a, b) => {
    if (metric === 'transactionCount') {
      return b.count - a.count;
    } else if (metric === 'totalValue') {
      return b.sum - a.sum;
    }
    return 0;
  });

  // Limit results
  return records.slice(0, limit);
}

/**
 * Get analytics for entire year, broken down by days
 *
 * @param {string} resourceName - Resource name
 * @param {string} field - Field name
 * @param {number} year - Year (e.g., 2025)
 * @param {Object} options - Options
 * @param {Object} fieldHandlers - Field handlers map
 * @returns {Promise<Array>} Daily analytics for the year (up to 365/366 records)
 */
export async function getYearByDay(resourceName, field, year, options, fieldHandlers) {
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;

  const data = await getAnalytics(resourceName, field, {
    period: 'day',
    startDate,
    endDate
  }, fieldHandlers);

  if (options.fillGaps) {
    return fillGaps(data, 'day', startDate, endDate);
  }

  return data;
}

/**
 * Get analytics for entire week, broken down by days
 *
 * @param {string} resourceName - Resource name
 * @param {string} field - Field name
 * @param {string} week - Week in YYYY-Www format (e.g., '2025-W42')
 * @param {Object} options - Options
 * @param {Object} fieldHandlers - Field handlers map
 * @returns {Promise<Array>} Daily analytics for the week (7 records)
 */
export async function getWeekByDay(resourceName, field, week, options, fieldHandlers) {
  // week format: '2025-W42'
  const year = parseInt(week.substring(0, 4));
  const weekNum = parseInt(week.substring(6, 8));

  // Calculate the first day of the week (Monday) using ISO 8601 - use UTC
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7; // Sunday = 7
  const firstMonday = new Date(Date.UTC(year, 0, 4 - jan4Day + 1));
  const weekStart = new Date(firstMonday);
  weekStart.setUTCDate(weekStart.getUTCDate() + (weekNum - 1) * 7);

  // Get all 7 days of the week
  const days = [];
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
    return fillGaps(data, 'day', startDate, endDate);
  }

  return data;
}

/**
 * Get analytics for entire week, broken down by hours
 *
 * @param {string} resourceName - Resource name
 * @param {string} field - Field name
 * @param {string} week - Week in YYYY-Www format (e.g., '2025-W42')
 * @param {Object} options - Options
 * @param {Object} fieldHandlers - Field handlers map
 * @returns {Promise<Array>} Hourly analytics for the week (168 records)
 */
export async function getWeekByHour(resourceName, field, week, options, fieldHandlers) {
  // week format: '2025-W42'
  const year = parseInt(week.substring(0, 4));
  const weekNum = parseInt(week.substring(6, 8));

  // Calculate the first day of the week (Monday) using ISO 8601 - use UTC
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7; // Sunday = 7
  const firstMonday = new Date(Date.UTC(year, 0, 4 - jan4Day + 1));
  const weekStart = new Date(firstMonday);
  weekStart.setUTCDate(weekStart.getUTCDate() + (weekNum - 1) * 7);

  // Get first and last day of week
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
 *
 * @param {string} resourceName - Resource name
 * @param {string} field - Field name
 * @param {number} hours - Number of hours to look back (default: 24)
 * @param {Object} options - Options
 * @param {Object} fieldHandlers - Field handlers map
 * @returns {Promise<Array>} Hourly analytics
 */
export async function getLastNHours(resourceName, field, hours = 24, options, fieldHandlers) {
  const now = new Date();
  const hoursAgo = new Date(now);
  hoursAgo.setHours(hoursAgo.getHours() - hours + 1); // +1 to include current hour

  const startHour = hoursAgo.toISOString().substring(0, 13); // YYYY-MM-DDTHH
  const endHour = now.toISOString().substring(0, 13);

  const data = await getAnalytics(resourceName, field, {
    period: 'hour',
    startDate: startHour,
    endDate: endHour
  }, fieldHandlers);

  if (options.fillGaps) {
    // For hour-level gaps, we need to manually generate the exact hours requested
    const result = [];
    const emptyRecord = { count: 0, sum: 0, avg: 0, min: 0, max: 0, recordCount: 0 };
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
 *
 * @param {string} resourceName - Resource name
 * @param {string} field - Field name
 * @param {number} weeks - Number of weeks to look back (default: 4)
 * @param {Object} options - Options
 * @param {Object} fieldHandlers - Field handlers map
 * @returns {Promise<Array>} Weekly analytics
 */
export async function getLastNWeeks(resourceName, field, weeks = 4, options, fieldHandlers) {
  const now = new Date();
  const weeksAgo = new Date(now);
  weeksAgo.setDate(weeksAgo.getDate() - (weeks * 7));

  // Get week cohorts for the range
  const weekCohorts = [];
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
 *
 * @param {string} resourceName - Resource name
 * @param {string} field - Field name
 * @param {number} months - Number of months to look back (default: 12)
 * @param {Object} options - Options
 * @param {Object} fieldHandlers - Field handlers map
 * @returns {Promise<Array>} Monthly analytics
 */
export async function getLastNMonths(resourceName, field, months = 12, options, fieldHandlers) {
  const now = new Date();
  const monthsAgo = new Date(now);
  monthsAgo.setMonth(monthsAgo.getMonth() - months + 1); // +1 to include current month

  const startDate = monthsAgo.toISOString().substring(0, 7); // YYYY-MM
  const endDate = now.toISOString().substring(0, 7);

  const data = await getAnalytics(resourceName, field, {
    period: 'month',
    startDate,
    endDate
  }, fieldHandlers);

  if (options.fillGaps) {
    // Generate exact months requested
    const result = [];
    const emptyRecord = { count: 0, sum: 0, avg: 0, min: 0, max: 0, recordCount: 0 };
    const dataMap = new Map(data.map(d => [d.cohort, d]));

    const current = new Date(monthsAgo);
    for (let i = 0; i < months; i++) {
      const cohort = current.toISOString().substring(0, 7);
      result.push(dataMap.get(cohort) || { cohort, ...emptyRecord });
      current.setMonth(current.getMonth() + 1);
    }

    return result;
  }

  return data;
}
