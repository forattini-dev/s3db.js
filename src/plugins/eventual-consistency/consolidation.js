/**
 * Consolidation logic for EventualConsistencyPlugin
 * @module eventual-consistency/consolidation
 */

import tryFn from "../../concerns/try-fn.js";
import { PromisePool } from "@supercharge/promise-pool";
import { idGenerator } from "../../concerns/id.js";
import { getCohortInfo, createSyntheticSetTransaction } from "./utils.js";
import { cleanupStaleLocks } from "./locks.js";

/**
 * Start consolidation timer for a handler
 *
 * @param {Object} handler - Field handler
 * @param {string} resourceName - Resource name
 * @param {string} fieldName - Field name
 * @param {Function} runConsolidationCallback - Callback to run consolidation
 * @param {Object} config - Plugin configuration
 * @returns {NodeJS.Timeout} Consolidation timer
 */
export function startConsolidationTimer(handler, resourceName, fieldName, runConsolidationCallback, config) {
  const intervalMs = config.consolidationInterval * 1000; // Convert seconds to ms

  if (config.verbose) {
    const nextRun = new Date(Date.now() + intervalMs);
    console.log(
      `[EventualConsistency] ${resourceName}.${fieldName} - ` +
      `Consolidation timer started. Next run at ${nextRun.toISOString()} ` +
      `(every ${config.consolidationInterval}s)`
    );
  }

  handler.consolidationTimer = setInterval(async () => {
    await runConsolidationCallback(handler, resourceName, fieldName);
  }, intervalMs);

  return handler.consolidationTimer;
}

/**
 * Run consolidation for all pending transactions
 *
 * @param {Object} transactionResource - Transaction resource
 * @param {Function} consolidateRecordFn - Function to consolidate individual records
 * @param {Function} emitFn - Function to emit events
 * @param {Object} config - Plugin configuration
 * @returns {Promise<void>}
 */
export async function runConsolidation(transactionResource, consolidateRecordFn, emitFn, config) {
  const startTime = Date.now();

  if (config.verbose) {
    console.log(
      `[EventualConsistency] ${config.resource}.${config.field} - ` +
      `Starting consolidation run at ${new Date().toISOString()}`
    );
  }

  try {
    // Query unapplied transactions from recent cohorts (last 24 hours by default)
    // This uses hourly partition for O(1) performance instead of full scan
    const now = new Date();
    const hoursToCheck = config.consolidationWindow || 24; // Configurable lookback window (in hours)
    const cohortHours = [];

    for (let i = 0; i < hoursToCheck; i++) {
      const date = new Date(now.getTime() - (i * 60 * 60 * 1000)); // Subtract hours
      const cohortInfo = getCohortInfo(date, config.cohort.timezone, config.verbose);
      cohortHours.push(cohortInfo.hour);
    }

    if (config.verbose) {
      console.log(
        `[EventualConsistency] ${config.resource}.${config.field} - ` +
        `Querying ${hoursToCheck} hour partitions for pending transactions...`
      );
    }

    // Query transactions by partition for each hour (parallel for speed)
    const transactionsByHour = await Promise.all(
      cohortHours.map(async (cohortHour) => {
        const [ok, err, txns] = await tryFn(() =>
          transactionResource.query({
            cohortHour,
            applied: false
          })
        );
        return ok ? txns : [];
      })
    );

    // Flatten all transactions
    const transactions = transactionsByHour.flat();

    if (transactions.length === 0) {
      if (config.verbose) {
        console.log(
          `[EventualConsistency] ${config.resource}.${config.field} - ` +
          `No pending transactions found. Next run in ${config.consolidationInterval}s`
        );
      }
      return;
    }

    // Get unique originalIds
    const uniqueIds = [...new Set(transactions.map(t => t.originalId))];

    if (config.verbose) {
      console.log(
        `[EventualConsistency] ${config.resource}.${config.field} - ` +
        `Found ${transactions.length} pending transactions for ${uniqueIds.length} records. ` +
        `Consolidating with concurrency=${config.consolidationConcurrency}...`
      );
    }

    // Consolidate each record in parallel with concurrency limit
    const { results, errors } = await PromisePool
      .for(uniqueIds)
      .withConcurrency(config.consolidationConcurrency)
      .process(async (id) => {
        return await consolidateRecordFn(id);
      });

    const duration = Date.now() - startTime;

    if (errors && errors.length > 0) {
      console.error(
        `[EventualConsistency] ${config.resource}.${config.field} - ` +
        `Consolidation completed with ${errors.length} errors in ${duration}ms:`,
        errors
      );
    }

    if (config.verbose) {
      console.log(
        `[EventualConsistency] ${config.resource}.${config.field} - ` +
        `Consolidation complete: ${results.length} records consolidated in ${duration}ms ` +
        `(${errors.length} errors). Next run in ${config.consolidationInterval}s`
      );
    }

    if (emitFn) {
      emitFn('eventual-consistency.consolidated', {
        resource: config.resource,
        field: config.field,
        recordCount: uniqueIds.length,
        successCount: results.length,
        errorCount: errors.length,
        duration
      });
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(
      `[EventualConsistency] ${config.resource}.${config.field} - ` +
      `Consolidation error after ${duration}ms:`,
      error
    );
    if (emitFn) {
      emitFn('eventual-consistency.consolidation-error', error);
    }
  }
}

/**
 * Consolidate a single record
 *
 * @param {string} originalId - ID of the record to consolidate
 * @param {Object} transactionResource - Transaction resource
 * @param {Object} targetResource - Target resource
 * @param {Object} lockResource - Lock resource
 * @param {Object} analyticsResource - Analytics resource (optional)
 * @param {Function} updateAnalyticsFn - Function to update analytics (optional)
 * @param {Object} config - Plugin configuration
 * @returns {Promise<number>} Consolidated value
 */
export async function consolidateRecord(
  originalId,
  transactionResource,
  targetResource,
  lockResource,
  analyticsResource,
  updateAnalyticsFn,
  config
) {
  // Clean up stale locks before attempting to acquire
  await cleanupStaleLocks(lockResource, config);

  // Acquire distributed lock to prevent concurrent consolidation
  const lockId = `lock-${originalId}`;
  const [lockAcquired, lockErr, lock] = await tryFn(() =>
    lockResource.insert({
      id: lockId,
      lockedAt: Date.now(),
      workerId: process.pid ? String(process.pid) : 'unknown'
    })
  );

  // If lock couldn't be acquired, another worker is consolidating
  if (!lockAcquired) {
    if (config.verbose) {
      console.log(`[EventualConsistency] Lock for ${originalId} already held, skipping`);
    }
    // Get current value and return (another worker will consolidate)
    const [recordOk, recordErr, record] = await tryFn(() =>
      targetResource.get(originalId)
    );
    return (recordOk && record) ? (record[config.field] || 0) : 0;
  }

  try {
    // Get all unapplied transactions for this record
    const [ok, err, transactions] = await tryFn(() =>
      transactionResource.query({
        originalId,
        applied: false
      })
    );

    if (!ok || !transactions || transactions.length === 0) {
      // No pending transactions - try to get current value from record
      const [recordOk, recordErr, record] = await tryFn(() =>
        targetResource.get(originalId)
      );
      const currentValue = (recordOk && record) ? (record[config.field] || 0) : 0;

      if (config.verbose) {
        console.log(
          `[EventualConsistency] ${config.resource}.${config.field} - ` +
          `No pending transactions for ${originalId}, skipping`
        );
      }
      return currentValue;
    }

    // Get the LAST APPLIED VALUE from transactions (not from record - avoids S3 eventual consistency issues)
    // This is the source of truth for the current value
    const [appliedOk, appliedErr, appliedTransactions] = await tryFn(() =>
      transactionResource.query({
        originalId,
        applied: true
      })
    );

    let currentValue = 0;

    if (appliedOk && appliedTransactions && appliedTransactions.length > 0) {
      // Check if record exists - if deleted, ignore old applied transactions
      const [recordExistsOk, recordExistsErr, recordExists] = await tryFn(() =>
        targetResource.get(originalId)
      );

      if (!recordExistsOk || !recordExists) {
        // Record was deleted - ignore applied transactions and start fresh
        // This prevents old values from being carried over after deletion
        if (config.verbose) {
          console.log(
            `[EventualConsistency] ${config.resource}.${config.field} - ` +
            `Record ${originalId} doesn't exist, deleting ${appliedTransactions.length} old applied transactions`
          );
        }

        // Delete old applied transactions to prevent them from being used when record is recreated
        const { results, errors } = await PromisePool
          .for(appliedTransactions)
          .withConcurrency(10)
          .process(async (txn) => {
            const [deleted] = await tryFn(() => transactionResource.delete(txn.id));
            return deleted;
          });

        if (config.verbose && errors && errors.length > 0) {
          console.warn(
            `[EventualConsistency] ${config.resource}.${config.field} - ` +
            `Failed to delete ${errors.length} old applied transactions`
          );
        }

        currentValue = 0;
      } else {
        // Record exists - use applied transactions to calculate current value
        // Sort by timestamp to get chronological order
        appliedTransactions.sort((a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

        // Check if there's a 'set' operation in applied transactions
        const hasSetInApplied = appliedTransactions.some(t => t.operation === 'set');

        if (!hasSetInApplied) {
          // No 'set' operation in applied transactions means we're missing the base value
          // This can only happen if:
          // 1. Record had an initial value before first transaction
          // 2. First consolidation didn't create an anchor transaction (legacy behavior)
          // Solution: Get the current record value and create an anchor transaction now
          const recordValue = recordExists[config.field] || 0;

          // Calculate what the base value was by subtracting all applied deltas
          let appliedDelta = 0;
          for (const t of appliedTransactions) {
            if (t.operation === 'add') appliedDelta += t.value;
            else if (t.operation === 'sub') appliedDelta -= t.value;
          }

          const baseValue = recordValue - appliedDelta;

          // Create and save anchor transaction with the base value
          // Only create if baseValue is non-zero AND we don't already have an anchor transaction
          const hasExistingAnchor = appliedTransactions.some(t => t.source === 'anchor');
          if (baseValue !== 0 && !hasExistingAnchor) {
            // Use the timestamp of the first applied transaction for cohort info
            const firstTransactionDate = new Date(appliedTransactions[0].timestamp);
            const cohortInfo = getCohortInfo(firstTransactionDate, config.cohort.timezone, config.verbose);
            const anchorTransaction = {
              id: idGenerator(),
              originalId: originalId,
              field: config.field,
              value: baseValue,
              operation: 'set',
              timestamp: new Date(firstTransactionDate.getTime() - 1).toISOString(), // 1ms before first txn to ensure it's first
              cohortDate: cohortInfo.date,
              cohortHour: cohortInfo.hour,
              cohortMonth: cohortInfo.month,
              source: 'anchor',
              applied: true
            };

            await transactionResource.insert(anchorTransaction);

            // Prepend to applied transactions for this consolidation
            appliedTransactions.unshift(anchorTransaction);
          }
        }

        // Apply reducer to get the last consolidated value
        currentValue = config.reducer(appliedTransactions);
      }
    } else {
      // No applied transactions - this is the FIRST consolidation
      // Try to get initial value from record
      const [recordOk, recordErr, record] = await tryFn(() =>
        targetResource.get(originalId)
      );
      currentValue = (recordOk && record) ? (record[config.field] || 0) : 0;

      // If there's an initial value, create and save an anchor transaction
      // This ensures all future consolidations have a reliable base value
      if (currentValue !== 0) {
        // Use timestamp of the first pending transaction (or current time if none)
        let anchorTimestamp;
        if (transactions && transactions.length > 0) {
          const firstPendingDate = new Date(transactions[0].timestamp);
          anchorTimestamp = new Date(firstPendingDate.getTime() - 1).toISOString();
        } else {
          anchorTimestamp = new Date().toISOString();
        }

        const cohortInfo = getCohortInfo(new Date(anchorTimestamp), config.cohort.timezone, config.verbose);
        const anchorTransaction = {
          id: idGenerator(),
          originalId: originalId,
          field: config.field,
          value: currentValue,
          operation: 'set',
          timestamp: anchorTimestamp,
          cohortDate: cohortInfo.date,
          cohortHour: cohortInfo.hour,
          cohortMonth: cohortInfo.month,
          source: 'anchor',
          applied: true
        };

        await transactionResource.insert(anchorTransaction);

        if (config.verbose) {
          console.log(
            `[EventualConsistency] ${config.resource}.${config.field} - ` +
            `Created anchor transaction for ${originalId} with base value ${currentValue}`
          );
        }
      }
    }

    if (config.verbose) {
      console.log(
        `[EventualConsistency] ${config.resource}.${config.field} - ` +
        `Consolidating ${originalId}: ${transactions.length} pending transactions ` +
        `(current: ${currentValue} from ${appliedOk && appliedTransactions?.length > 0 ? 'applied transactions' : 'record'})`
      );
    }

    // Sort pending transactions by timestamp
    transactions.sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // If there's a current value and no 'set' operations in pending transactions,
    // prepend a synthetic set transaction to preserve the current value
    const hasSetOperation = transactions.some(t => t.operation === 'set');
    if (currentValue !== 0 && !hasSetOperation) {
      transactions.unshift(createSyntheticSetTransaction(currentValue));
    }

    // Apply reducer to get consolidated value
    const consolidatedValue = config.reducer(transactions);

    if (config.verbose) {
      console.log(
        `[EventualConsistency] ${config.resource}.${config.field} - ` +
        `${originalId}: ${currentValue} → ${consolidatedValue} ` +
        `(${consolidatedValue > currentValue ? '+' : ''}${consolidatedValue - currentValue})`
      );
    }

    // Update the original record
    // NOTE: We do NOT attempt to insert non-existent records because:
    // 1. Target resources typically have required fields we don't know about
    // 2. Record creation should be the application's responsibility
    // 3. Transactions will remain pending until the record is created
    const [updateOk, updateErr] = await tryFn(() =>
      targetResource.update(originalId, {
        [config.field]: consolidatedValue
      })
    );

    if (!updateOk) {
      // Check if record doesn't exist
      if (updateErr?.message?.includes('does not exist')) {
        // Record doesn't exist - skip consolidation and keep transactions pending
        if (config.verbose) {
          console.warn(
            `[EventualConsistency] ${config.resource}.${config.field} - ` +
            `Record ${originalId} doesn't exist. Skipping consolidation. ` +
            `${transactions.length} transactions will remain pending until record is created.`
          );
        }

        // Return the consolidated value (for informational purposes)
        // Transactions remain pending and will be picked up when record exists
        return consolidatedValue;
      }

      // Update failed for another reason - this is a real error
      console.error(
        `[EventualConsistency] ${config.resource}.${config.field} - ` +
        `FAILED to update ${originalId}: ${updateErr?.message || updateErr}`,
        { error: updateErr, consolidatedValue, currentValue }
      );
      throw updateErr;
    }

    if (updateOk) {
      // Mark transactions as applied (skip synthetic ones) - use PromisePool for controlled concurrency
      const transactionsToUpdate = transactions.filter(txn => txn.id !== '__synthetic__');

      const { results, errors } = await PromisePool
        .for(transactionsToUpdate)
        .withConcurrency(10) // Limit parallel updates
        .process(async (txn) => {
          const [ok, err] = await tryFn(() =>
            transactionResource.update(txn.id, { applied: true })
          );

          if (!ok && config.verbose) {
            console.warn(`[EventualConsistency] Failed to mark transaction ${txn.id} as applied:`, err?.message);
          }

          return ok;
        });

      if (errors && errors.length > 0 && config.verbose) {
        console.warn(`[EventualConsistency] ${errors.length} transactions failed to mark as applied`);
      }

      // Update analytics if enabled (only for real transactions, not synthetic)
      if (config.enableAnalytics && transactionsToUpdate.length > 0 && updateAnalyticsFn) {
        const [analyticsOk, analyticsErr] = await tryFn(() =>
          updateAnalyticsFn(transactionsToUpdate)
        );

        if (!analyticsOk) {
          // Analytics failure should NOT prevent consolidation success
          // But we should log it prominently
          console.error(
            `[EventualConsistency] ${config.resource}.${config.field} - ` +
            `CRITICAL: Analytics update failed for ${originalId}, but consolidation succeeded:`,
            {
              error: analyticsErr?.message || analyticsErr,
              stack: analyticsErr?.stack,
              originalId,
              transactionCount: transactionsToUpdate.length
            }
          );
        }
      }

      // Invalidate cache for this record after consolidation
      if (targetResource && targetResource.cache && typeof targetResource.cache.delete === 'function') {
        try {
          const cacheKey = await targetResource.cacheKeyFor({ id: originalId });
          await targetResource.cache.delete(cacheKey);

          if (config.verbose) {
            console.log(
              `[EventualConsistency] ${config.resource}.${config.field} - ` +
              `Cache invalidated for ${originalId}`
            );
          }
        } catch (cacheErr) {
          // Log but don't fail consolidation if cache invalidation fails
          if (config.verbose) {
            console.warn(
              `[EventualConsistency] ${config.resource}.${config.field} - ` +
              `Failed to invalidate cache for ${originalId}: ${cacheErr?.message}`
            );
          }
        }
      }
    }

    return consolidatedValue;
  } finally {
    // Always release the lock
    const [lockReleased, lockReleaseErr] = await tryFn(() => lockResource.delete(lockId));

    if (!lockReleased && config.verbose) {
      console.warn(`[EventualConsistency] Failed to release lock ${lockId}:`, lockReleaseErr?.message);
    }
  }
}

/**
 * Get consolidated value without applying
 *
 * @param {string} originalId - ID of the record
 * @param {Object} options - Query options
 * @param {Object} transactionResource - Transaction resource
 * @param {Object} targetResource - Target resource
 * @param {Object} config - Plugin configuration
 * @returns {Promise<number>} Consolidated value
 */
export async function getConsolidatedValue(originalId, options, transactionResource, targetResource, config) {
  const includeApplied = options.includeApplied || false;
  const startDate = options.startDate;
  const endDate = options.endDate;

  // Build query
  const query = { originalId };
  if (!includeApplied) {
    query.applied = false;
  }

  // Get transactions
  const [ok, err, transactions] = await tryFn(() =>
    transactionResource.query(query)
  );

  if (!ok || !transactions || transactions.length === 0) {
    // If no transactions, check if record exists and return its current value
    const [recordOk, recordErr, record] = await tryFn(() =>
      targetResource.get(originalId)
    );

    if (recordOk && record) {
      return record[config.field] || 0;
    }

    return 0;
  }

  // Filter by date range if specified
  let filtered = transactions;
  if (startDate || endDate) {
    filtered = transactions.filter(t => {
      const timestamp = new Date(t.timestamp);
      if (startDate && timestamp < new Date(startDate)) return false;
      if (endDate && timestamp > new Date(endDate)) return false;
      return true;
    });
  }

  // Get current value from record
  const [recordOk, recordErr, record] = await tryFn(() =>
    targetResource.get(originalId)
  );
  const currentValue = (recordOk && record) ? (record[config.field] || 0) : 0;

  // Check if there's a 'set' operation in filtered transactions
  const hasSetOperation = filtered.some(t => t.operation === 'set');

  // If current value exists and no 'set', prepend synthetic set transaction
  if (currentValue !== 0 && !hasSetOperation) {
    filtered.unshift(createSyntheticSetTransaction(currentValue));
  }

  // Sort by timestamp
  filtered.sort((a, b) =>
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  // Apply reducer
  return config.reducer(filtered);
}

/**
 * Get cohort statistics
 *
 * @param {string} cohortDate - Cohort date to get stats for
 * @param {Object} transactionResource - Transaction resource
 * @returns {Promise<Object|null>} Cohort statistics
 */
export async function getCohortStats(cohortDate, transactionResource) {
  const [ok, err, transactions] = await tryFn(() =>
    transactionResource.query({
      cohortDate
    })
  );

  if (!ok) return null;

  const stats = {
    date: cohortDate,
    transactionCount: transactions.length,
    totalValue: 0,
    byOperation: { set: 0, add: 0, sub: 0 },
    byOriginalId: {}
  };

  for (const txn of transactions) {
    stats.totalValue += txn.value || 0;
    stats.byOperation[txn.operation] = (stats.byOperation[txn.operation] || 0) + 1;

    if (!stats.byOriginalId[txn.originalId]) {
      stats.byOriginalId[txn.originalId] = {
        count: 0,
        value: 0
      };
    }
    stats.byOriginalId[txn.originalId].count++;
    stats.byOriginalId[txn.originalId].value += txn.value || 0;
  }

  return stats;
}

/**
 * Recalculate from scratch by resetting all transactions to pending
 * This is useful for debugging, recovery, or when you want to recompute everything
 *
 * @param {string} originalId - ID of the record to recalculate
 * @param {Object} transactionResource - Transaction resource
 * @param {Object} targetResource - Target resource
 * @param {Object} lockResource - Lock resource
 * @param {Function} consolidateRecordFn - Function to consolidate the record
 * @param {Object} config - Plugin configuration
 * @returns {Promise<number>} Recalculated value
 */
export async function recalculateRecord(
  originalId,
  transactionResource,
  targetResource,
  lockResource,
  consolidateRecordFn,
  config
) {
  // Clean up stale locks before attempting to acquire
  await cleanupStaleLocks(lockResource, config);

  // Acquire distributed lock to prevent concurrent operations
  const lockId = `lock-recalculate-${originalId}`;
  const [lockAcquired, lockErr, lock] = await tryFn(() =>
    lockResource.insert({
      id: lockId,
      lockedAt: Date.now(),
      workerId: process.pid ? String(process.pid) : 'unknown'
    })
  );

  // If lock couldn't be acquired, another worker is operating on this record
  if (!lockAcquired) {
    if (config.verbose) {
      console.log(`[EventualConsistency] Recalculate lock for ${originalId} already held, skipping`);
    }
    throw new Error(`Cannot recalculate ${originalId}: lock already held by another worker`);
  }

  try {
    if (config.verbose) {
      console.log(
        `[EventualConsistency] ${config.resource}.${config.field} - ` +
        `Starting recalculation for ${originalId} (resetting all transactions to pending)`
      );
    }

    // Get ALL transactions for this record (both applied and pending)
    const [allOk, allErr, allTransactions] = await tryFn(() =>
      transactionResource.query({
        originalId
      })
    );

    if (!allOk || !allTransactions || allTransactions.length === 0) {
      if (config.verbose) {
        console.log(
          `[EventualConsistency] ${config.resource}.${config.field} - ` +
          `No transactions found for ${originalId}, nothing to recalculate`
        );
      }
      return 0;
    }

    if (config.verbose) {
      console.log(
        `[EventualConsistency] ${config.resource}.${config.field} - ` +
        `Found ${allTransactions.length} total transactions for ${originalId}, marking all as pending...`
      );
    }

    // Mark ALL transactions as pending (applied: false)
    // Exclude anchor transactions (they should always be applied)
    const transactionsToReset = allTransactions.filter(txn => txn.source !== 'anchor');

    const { results, errors } = await PromisePool
      .for(transactionsToReset)
      .withConcurrency(10)
      .process(async (txn) => {
        const [ok, err] = await tryFn(() =>
          transactionResource.update(txn.id, { applied: false })
        );

        if (!ok && config.verbose) {
          console.warn(`[EventualConsistency] Failed to reset transaction ${txn.id}:`, err?.message);
        }

        return ok;
      });

    if (errors && errors.length > 0) {
      console.warn(
        `[EventualConsistency] ${config.resource}.${config.field} - ` +
        `Failed to reset ${errors.length} transactions during recalculation`
      );
    }

    if (config.verbose) {
      console.log(
        `[EventualConsistency] ${config.resource}.${config.field} - ` +
        `Reset ${results.length} transactions to pending, now resetting record value and running consolidation...`
      );
    }

    // Reset the record's field value to 0 to prevent double-counting
    // This ensures consolidation starts fresh without using the old value as an anchor
    const [resetOk, resetErr] = await tryFn(() =>
      targetResource.update(originalId, {
        [config.field]: 0
      })
    );

    if (!resetOk && config.verbose) {
      console.warn(
        `[EventualConsistency] ${config.resource}.${config.field} - ` +
        `Failed to reset record value for ${originalId}: ${resetErr?.message}`
      );
    }

    // Now run normal consolidation which will process all pending transactions
    const consolidatedValue = await consolidateRecordFn(originalId);

    if (config.verbose) {
      console.log(
        `[EventualConsistency] ${config.resource}.${config.field} - ` +
        `Recalculation complete for ${originalId}: final value = ${consolidatedValue}`
      );
    }

    return consolidatedValue;
  } finally {
    // Always release the lock
    const [lockReleased, lockReleaseErr] = await tryFn(() => lockResource.delete(lockId));

    if (!lockReleased && config.verbose) {
      console.warn(`[EventualConsistency] Failed to release recalculate lock ${lockId}:`, lockReleaseErr?.message);
    }
  }
}
