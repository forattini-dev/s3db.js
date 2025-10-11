/**
 * Utility functions for EventualConsistencyPlugin
 * @module eventual-consistency/utils
 */

/**
 * Get timezone (from environment or default to UTC)
 * @returns {string} Timezone (defaults to 'UTC')
 */
export function detectTimezone() {
  // 1. Try TZ environment variable (common in Docker/K8s)
  if (process.env.TZ) {
    return process.env.TZ;
  }

  // 2. Default to UTC
  return 'UTC';
}

/**
 * Get timezone offset in milliseconds
 * @param {string} timezone - IANA timezone name
 * @param {boolean} verbose - Whether to log warnings
 * @returns {number} Offset in milliseconds
 */
export function getTimezoneOffset(timezone, verbose = false) {
  // Try to calculate offset using Intl API (handles DST automatically)
  try {
    const now = new Date();

    // Get UTC time
    const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));

    // Get time in target timezone
    const tzDate = new Date(now.toLocaleString('en-US', { timeZone: timezone }));

    // Calculate offset in milliseconds
    return tzDate.getTime() - utcDate.getTime();
  } catch (err) {
    // Intl API failed, fallback to manual offsets (without DST support)
    const offsets = {
      'UTC': 0,
      'America/New_York': -5 * 3600000,
      'America/Chicago': -6 * 3600000,
      'America/Denver': -7 * 3600000,
      'America/Los_Angeles': -8 * 3600000,
      'America/Sao_Paulo': -3 * 3600000,
      'Europe/London': 0,
      'Europe/Paris': 1 * 3600000,
      'Europe/Berlin': 1 * 3600000,
      'Asia/Tokyo': 9 * 3600000,
      'Asia/Shanghai': 8 * 3600000,
      'Australia/Sydney': 10 * 3600000
    };

    if (verbose && !offsets[timezone]) {
      console.warn(
        `[EventualConsistency] Unknown timezone '${timezone}', using UTC. ` +
        `Consider using a valid IANA timezone (e.g., 'America/New_York')`
      );
    }

    return offsets[timezone] || 0;
  }
}

/**
 * Calculate ISO 8601 week number for a date
 * @param {Date} date - Date to get week number for
 * @returns {Object} Year and week number { year, week }
 */
function getISOWeek(date) {
  // Copy date to avoid mutating original
  const target = new Date(date.valueOf());

  // ISO week starts on Monday (day 1)
  // Find Thursday of this week (ISO week contains Jan 4th)
  const dayNr = (date.getUTCDay() + 6) % 7; // Make Monday = 0 (use UTC)
  target.setUTCDate(target.getUTCDate() - dayNr + 3); // Thursday of this week

  // Get first Thursday of the year (use UTC)
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const firstThursday = new Date(yearStart.valueOf());
  if (yearStart.getUTCDay() !== 4) {
    firstThursday.setUTCDate(yearStart.getUTCDate() + ((4 - yearStart.getUTCDay()) + 7) % 7);
  }

  // Calculate week number
  const weekNumber = 1 + Math.round((target - firstThursday) / 604800000);

  return {
    year: target.getUTCFullYear(),
    week: weekNumber
  };
}

/**
 * Get cohort information for a date
 * @param {Date} date - Date to get cohort info for
 * @param {string} timezone - IANA timezone name
 * @param {boolean} verbose - Whether to log warnings
 * @returns {Object} Cohort information (date, hour, week, month)
 */
export function getCohortInfo(date, timezone, verbose = false) {
  // Simple timezone offset calculation
  const offset = getTimezoneOffset(timezone, verbose);
  const localDate = new Date(date.getTime() + offset);

  const year = localDate.getFullYear();
  const month = String(localDate.getMonth() + 1).padStart(2, '0');
  const day = String(localDate.getDate()).padStart(2, '0');
  const hour = String(localDate.getHours()).padStart(2, '0');

  // Calculate ISO week
  const { year: weekYear, week: weekNumber } = getISOWeek(localDate);
  const week = `${weekYear}-W${String(weekNumber).padStart(2, '0')}`;

  return {
    date: `${year}-${month}-${day}`,
    hour: `${year}-${month}-${day}T${hour}`, // ISO-like format for hour partition
    week: week, // ISO 8601 week format (e.g., '2025-W42')
    month: `${year}-${month}`
  };
}

/**
 * Create synthetic 'set' transaction from current value
 * @param {number} currentValue - Current value to create transaction for
 * @returns {Object} Synthetic transaction object
 */
export function createSyntheticSetTransaction(currentValue) {
  return {
    id: '__synthetic__',
    operation: 'set',
    value: currentValue,
    timestamp: new Date(0).toISOString(),
    synthetic: true
  };
}

/**
 * Create a field handler for a specific resource/field combination
 * @param {string} resourceName - Resource name
 * @param {string} fieldName - Field name
 * @returns {Object} Field handler object
 */
export function createFieldHandler(resourceName, fieldName) {
  return {
    resource: resourceName,
    field: fieldName,
    transactionResource: null,
    targetResource: null,
    analyticsResource: null,
    lockResource: null,
    checkpointResource: null,
    consolidationTimer: null,
    gcTimer: null,
    pendingTransactions: new Map(),
    deferredSetup: false
  };
}

/**
 * Resolve field and plugin from arguments
 * @param {Object} resource - Resource object
 * @param {string} field - Field name
 * @param {*} value - Value (for error reporting)
 * @returns {Object} Resolved field and plugin handler
 * @throws {Error} If field or plugin not found
 */
export function resolveFieldAndPlugin(resource, field, value) {
  if (!resource._eventualConsistencyPlugins) {
    throw new Error(`No eventual consistency plugins configured for this resource`);
  }

  const fieldPlugin = resource._eventualConsistencyPlugins[field];

  if (!fieldPlugin) {
    const availableFields = Object.keys(resource._eventualConsistencyPlugins).join(', ');
    throw new Error(
      `No eventual consistency plugin found for field "${field}". ` +
      `Available fields: ${availableFields}`
    );
  }

  return { field, value, plugin: fieldPlugin };
}

/**
 * Group transactions by cohort field
 * @param {Array} transactions - Transactions to group
 * @param {string} cohortField - Field to group by (e.g., 'cohortHour')
 * @returns {Object} Grouped transactions
 */
export function groupByCohort(transactions, cohortField) {
  const groups = {};
  for (const txn of transactions) {
    const cohort = txn[cohortField];
    if (!cohort) continue;

    if (!groups[cohort]) {
      groups[cohort] = [];
    }
    groups[cohort].push(txn);
  }
  return groups;
}
