import { PluginError } from '../../errors.js';

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
        // `[EventualConsistency] Unknown timezone '${timezone}', using UTC. ` +
        // `Consider using a valid IANA timezone (e.g., 'America/New_York')`
      // );
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
 * Validate nested path in resource schema
 * Allows 1 level of nesting after 'json' type fields
 *
 * @param {Object} resource - Resource object
 * @param {string} fieldPath - Dot-notation path (e.g., 'utmResults.medium.google')
 * @returns {Object} { valid: boolean, rootField: string, fullPath: string, error?: string }
 */
export function validateNestedPath(resource, fieldPath) {
  const parts = fieldPath.split('.');
  const rootField = parts[0];

  // Root field must exist in resource attributes
  if (!resource.attributes || !resource.attributes[rootField]) {
    return {
      valid: false,
      rootField,
      fullPath: fieldPath,
      error: `Root field "${rootField}" not found in resource attributes`
    };
  }

  // If no nesting, just return valid
  if (parts.length === 1) {
    return { valid: true, rootField, fullPath: fieldPath };
  }

  // Validate nested path
  let current = resource.attributes[rootField];
  let foundJson = false;
  let levelsAfterJson = 0;

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];

    // If we found 'json' before, count levels
    if (foundJson) {
      levelsAfterJson++;
      // Only allow 1 level after 'json'
      if (levelsAfterJson > 1) {
        return {
          valid: false,
          rootField,
          fullPath: fieldPath,
          error: `Path "${fieldPath}" exceeds 1 level after 'json' field. Maximum nesting after 'json' is 1 level.`
        };
      }
      // After 'json', we can't validate further, but we allow 1 level
      continue;
    }

    // Check if current level is 'json' type
    if (typeof current === 'string') {
      if (current === 'json' || current.startsWith('json|')) {
        foundJson = true;
        levelsAfterJson++;
        // Allow 1 level after json
        if (levelsAfterJson > 1) {
          return {
            valid: false,
            rootField,
            fullPath: fieldPath,
            error: `Path "${fieldPath}" exceeds 1 level after 'json' field`
          };
        }
        continue;
      }
      // Other string types can't be nested
      return {
        valid: false,
        rootField,
        fullPath: fieldPath,
        error: `Field "${parts.slice(0, i).join('.')}" is type "${current}" and cannot be nested`
      };
    }

    // Check if current is an object with nested structure
    if (typeof current === 'object') {
      // Check for $$type
      if (current.$$type) {
        const type = current.$$type;
        if (type === 'json' || type.includes('json')) {
          foundJson = true;
          levelsAfterJson++;
          continue;
        }
        if (type !== 'object' && !type.includes('object')) {
          return {
            valid: false,
            rootField,
            fullPath: fieldPath,
            error: `Field "${parts.slice(0, i).join('.')}" is type "${type}" and cannot be nested`
          };
        }
      }

      // Navigate to next level
      if (!current[part]) {
        return {
          valid: false,
          rootField,
          fullPath: fieldPath,
          error: `Field "${part}" not found in "${parts.slice(0, i).join('.')}"`
        };
      }
      current = current[part];
    } else {
      return {
        valid: false,
        rootField,
        fullPath: fieldPath,
        error: `Invalid structure at "${parts.slice(0, i).join('.')}"`
      };
    }
  }

  return { valid: true, rootField, fullPath: fieldPath };
}

/**
 * Resolve field and plugin from arguments
 * Supports dot notation for nested fields (e.g., 'utmResults.medium.google')
 *
 * @param {Object} resource - Resource object
 * @param {string} field - Field name or path (supports dot notation)
 * @param {*} value - Value (for error reporting)
 * @returns {Object} Resolved field, path, and plugin handler
 * @throws {Error} If field or plugin not found, or path is invalid
 */
export function resolveFieldAndPlugin(resource, field, value) {
  if (!resource._eventualConsistencyPlugins) {
    throw new PluginError('No eventual consistency plugins configured for this resource', {
      pluginName: 'EventualConsistencyPlugin',
      operation: 'resolveFieldAndPlugin',
      statusCode: 404,
      retriable: false,
      suggestion: 'Configure EventualConsistencyPlugin resources before using helper methods.'
    });
  }

  // Check if field contains dot notation (nested path)
  if (field.includes('.')) {
    const validation = validateNestedPath(resource, field);

    if (!validation.valid) {
      throw new PluginError(validation.error, {
        pluginName: 'EventualConsistencyPlugin',
        operation: 'resolveFieldAndPlugin',
        statusCode: 400,
        retriable: false,
        suggestion: 'Ensure nested field paths exist on the resource before using dot notation.'
      });
    }

    // Get plugin for root field
    const rootField = validation.rootField;
    const fieldPlugin = resource._eventualConsistencyPlugins[rootField];

    if (!fieldPlugin) {
      const availableFields = Object.keys(resource._eventualConsistencyPlugins).join(', ');
      throw new PluginError(`No eventual consistency plugin found for root field "${rootField}"`, {
        pluginName: 'EventualConsistencyPlugin',
        operation: 'resolveFieldAndPlugin',
        statusCode: 404,
        retriable: false,
        suggestion: `Available fields: ${availableFields}`,
        field: rootField
      });
    }

    return {
      field: rootField,           // Root field for plugin lookup
      fieldPath: field,            // Full path for nested access
      value,
      plugin: fieldPlugin
    };
  }

  // Simple field (no nesting)
  const fieldPlugin = resource._eventualConsistencyPlugins[field];

  if (!fieldPlugin) {
    const availableFields = Object.keys(resource._eventualConsistencyPlugins).join(', ');
    throw new PluginError(`No eventual consistency plugin found for field "${field}"`, {
      pluginName: 'EventualConsistencyPlugin',
      operation: 'resolveFieldAndPlugin',
      statusCode: 404,
      retriable: false,
      suggestion: `Available fields: ${availableFields}`,
      field
    });
  }

  return { field, fieldPath: field, value, plugin: fieldPlugin };
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

/**
 * Ensure transaction has cohortHour field
 * ✅ FIX BUG #2: Calculate cohortHour from timestamp if missing
 *
 * @param {Object} transaction - Transaction to check/fix
 * @param {string} timezone - Timezone to use for cohort calculation
 * @param {boolean} verbose - Whether to log warnings
 * @returns {Object} Transaction with cohortHour populated
 */
export function ensureCohortHour(transaction, timezone = 'UTC', verbose = false) {
  // If cohortHour already exists, return as-is
  if (transaction.cohortHour) {
    return transaction;
  }

  // Calculate cohortHour from timestamp
  if (transaction.timestamp) {
    const date = new Date(transaction.timestamp);
    const cohortInfo = getCohortInfo(date, timezone, verbose);

    if (verbose) {
        // `[EventualConsistency] Transaction ${transaction.id} missing cohortHour, ` +
        // `calculated from timestamp: ${cohortInfo.hour}`
      // );
    }

    // Add cohortHour (and other cohort fields if missing)
    transaction.cohortHour = cohortInfo.hour;

    if (!transaction.cohortWeek) {
      transaction.cohortWeek = cohortInfo.week;
    }

    if (!transaction.cohortMonth) {
      transaction.cohortMonth = cohortInfo.month;
    }
  } else if (verbose) {
      // `[EventualConsistency] Transaction ${transaction.id} missing both cohortHour and timestamp, ` +
      // `cannot calculate cohort`
    // );
  }

  return transaction;
}

/**
 * Ensure all transactions in array have cohortHour
 * ✅ FIX BUG #2: Batch version of ensureCohortHour
 *
 * @param {Array} transactions - Transactions to check/fix
 * @param {string} timezone - Timezone to use for cohort calculation
 * @param {boolean} verbose - Whether to log warnings
 * @returns {Array} Transactions with cohortHour populated
 */
export function ensureCohortHours(transactions, timezone = 'UTC', verbose = false) {
  if (!transactions || !Array.isArray(transactions)) {
    return transactions;
  }

  return transactions.map(txn => ensureCohortHour(txn, timezone, verbose));
}
