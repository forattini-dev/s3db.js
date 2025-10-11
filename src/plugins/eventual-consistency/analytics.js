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
      `Config: ${JSON.stringify({ resource: config.resource, field: config.field, verbose: config.verbose })}\n` +
      `Transactions count: ${transactions.length}\n` +
      `AnalyticsResource: ${analyticsResource?.name || 'unknown'}`
    );
  }

  if (config.verbose || config.debug) {
    console.log(
      `[EventualConsistency] ${config.resource}.${config.field} - ` +
      `Updating analytics for ${transactions.length} transactions...`
    );
  }

  try {
    // Group transactions by cohort hour
    const byHour = groupByCohort(transactions, 'cohortHour');
    const cohortCount = Object.keys(byHour).length;

    if (config.verbose || config.debug) {
      console.log(
        `[EventualConsistency] ${config.resource}.${config.field} - ` +
        `Updating ${cohortCount} hourly analytics cohorts...`
      );
    }

    // Update hourly analytics
    for (const [cohort, txns] of Object.entries(byHour)) {
      await upsertAnalytics('hour', cohort, txns, analyticsResource, config);
    }

    // Roll up to daily and monthly if configured
    if (config.analyticsConfig.rollupStrategy === 'incremental') {
      const uniqueHours = Object.keys(byHour);

      if (config.verbose || config.debug) {
        console.log(
          `[EventualConsistency] ${config.resource}.${config.field} - ` +
          `Rolling up ${uniqueHours.length} hours to daily/monthly analytics...`
        );
      }

      for (const cohortHour of uniqueHours) {
        await rollupAnalytics(cohortHour, analyticsResource, config);
      }
    }

    if (config.verbose || config.debug) {
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
 * Roll up hourly analytics to daily and monthly
 * @private
 */
async function rollupAnalytics(cohortHour, analyticsResource, config) {
  // cohortHour format: '2025-10-09T14'
  const cohortDate = cohortHour.substring(0, 10); // '2025-10-09'
  const cohortMonth = cohortHour.substring(0, 7);  // '2025-10'

  // Roll up to day
  await rollupPeriod('day', cohortDate, cohortDate, analyticsResource, config);

  // Roll up to month
  await rollupPeriod('month', cohortMonth, cohortMonth, analyticsResource, config);
}

/**
 * Roll up analytics for a specific period
 * @private
 */
async function rollupPeriod(period, cohort, sourcePrefix, analyticsResource, config) {
  // Get all source analytics (e.g., all hours for a day)
  const sourcePeriod = period === 'day' ? 'hour' : 'day';

  const [ok, err, allAnalytics] = await tryFn(() =>
    analyticsResource.list()
  );

  if (!ok || !allAnalytics) return;

  // Filter to matching cohorts
  const sourceAnalytics = allAnalytics.filter(a =>
    a.period === sourcePeriod && a.cohort.startsWith(sourcePrefix)
  );

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
