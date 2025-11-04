/**
 * Consolidation logic for EventualConsistencyPlugin
 * @module eventual-consistency/consolidation
 */

import tryFn from "../../concerns/try-fn.js";
import { PromisePool } from "@supercharge/promise-pool";
import { idGenerator } from "../../concerns/id.js";
import { getCohortInfo, createSyntheticSetTransaction, ensureCohortHour } from "./utils.js";
import { PluginError } from '../../errors.js';
import { getCronManager } from "../../concerns/cron-manager.js";

/**
 * Start consolidation timer for a handler
 *
 * @param {Object} handler - Field handler
 * @param {string} resourceName - Resource name
 * @param {string} fieldName - Field name
 * @param {Function} runConsolidationCallback - Callback to run consolidation
 * @param {Object} config - Plugin configuration
 * @returns {string} Consolidation job name
 */
export function startConsolidationTimer(handler, resourceName, fieldName, runConsolidationCallback, config) {
  const intervalMs = config.consolidationInterval * 1000; // Convert seconds to ms
  const cronManager = getCronManager();
  const jobName = `consolidation-${resourceName}-${fieldName}-${Date.now()}`;

  if (config.verbose) {
    const nextRun = new Date(Date.now() + intervalMs);
    console.log(
      `[EventualConsistency] ${resourceName}.${fieldName} - ` +
      `Consolidation timer started. Next run at ${nextRun.toISOString()} ` +
      `(every ${config.consolidationInterval}s)`
    );
  }

  cronManager.scheduleInterval(
    intervalMs,
    async () => {
      await runConsolidationCallback(handler, resourceName, fieldName);
    },
    jobName
  );

  handler.consolidationJobName = jobName;
  return jobName;
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
      emitFn('plg:eventual-consistency:consolidated', {
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
      emitFn('plg:eventual-consistency:consolidation-error', error);
    }
  }
}

/**
 * Consolidate a single record
 *
 * @param {string} originalId - ID of the record to consolidate
 * @param {Object} transactionResource - Transaction resource
 * @param {Object} targetResource - Target resource
 * @param {Object} storage - PluginStorage instance for locks
 * @param {Object} analyticsResource - Analytics resource (optional)
 * @param {Function} updateAnalyticsFn - Function to update analytics (optional)
 * @param {Object} config - Plugin configuration
 * @returns {Promise<number>} Consolidated value
 */
export async function consolidateRecord(
  originalId,
  transactionResource,
  targetResource,
  storage,
  analyticsResource,
  updateAnalyticsFn,
  config
) {
  // Acquire distributed lock with TTL to prevent concurrent consolidation
  const lockKey = `consolidation-${config.resource}-${config.field}-${originalId}`;
  const lock = await storage.acquireLock(lockKey, {
    ttl: config.lockTimeout || 30,
    timeout: 0, // Don't wait if locked
    workerId: process.pid ? String(process.pid) : 'unknown'
  });

  // If lock couldn't be acquired, another worker is consolidating
  if (!lock) {
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
        // Clear the applied transactions array since we deleted them
        appliedTransactions.length = 0;
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
          // This can happen if record had an initial value before first transaction
          // Solution: Get the current record value and create an anchor transaction now
          const recordValue = recordExists[config.field] || 0;

          // Only create anchor if recordValue is a number (not object/array for nested fields)
          if (typeof recordValue === 'number') {
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
            if (baseValue !== 0 && typeof baseValue === 'number' && !hasExistingAnchor) {
              // Use the timestamp of the first applied transaction for cohort info
              const firstTransactionDate = new Date(appliedTransactions[0].timestamp);
              const cohortInfo = getCohortInfo(firstTransactionDate, config.cohort.timezone, config.verbose);
              const anchorTransaction = {
                id: idGenerator(),
                originalId: originalId,
                field: config.field,
                fieldPath: config.field,  // Add fieldPath for consistency
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
      // IMPORTANT: Only create anchor if currentValue is a number (not object/array for nested fields)
      if (currentValue !== 0 && typeof currentValue === 'number') {
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
          fieldPath: config.field,  // Add fieldPath for consistency
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

    // Group PENDING transactions by fieldPath to support nested fields
    const transactionsByPath = {};
    for (const txn of transactions) {
      const path = txn.fieldPath || txn.field || config.field;
      if (!transactionsByPath[path]) {
        transactionsByPath[path] = [];
      }
      transactionsByPath[path].push(txn);
    }

    // For each fieldPath, we need the currentValue from applied transactions
    // Group APPLIED transactions by fieldPath
    const appliedByPath = {};
    if (appliedOk && appliedTransactions && appliedTransactions.length > 0) {
      for (const txn of appliedTransactions) {
        const path = txn.fieldPath || txn.field || config.field;
        if (!appliedByPath[path]) {
          appliedByPath[path] = [];
        }
        appliedByPath[path].push(txn);
      }
    }

    // Consolidate each fieldPath group separately
    const consolidatedValues = {};
    const lodash = await import('lodash-es');

    // Get current record to extract existing values for nested paths
    const [currentRecordOk, currentRecordErr, currentRecord] = await tryFn(() =>
      targetResource.get(originalId)
    );

    for (const [fieldPath, pathTransactions] of Object.entries(transactionsByPath)) {
      // Calculate current value for this path from applied transactions
      let pathCurrentValue = 0;
      if (appliedByPath[fieldPath] && appliedByPath[fieldPath].length > 0) {
        // Sort applied transactions by timestamp
        appliedByPath[fieldPath].sort((a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        // Apply reducer to get current value from applied transactions
        pathCurrentValue = config.reducer(appliedByPath[fieldPath]);
      } else {
        // No applied transactions yet - use value from record (first consolidation)
        // This happens when there's an initial value in the record before any consolidation
        if (currentRecordOk && currentRecord) {
          const recordValue = lodash.get(currentRecord, fieldPath, 0);
          if (typeof recordValue === 'number') {
            pathCurrentValue = recordValue;
          }
        }
      }

      // Prepend synthetic set transaction with current value
      if (pathCurrentValue !== 0) {
        pathTransactions.unshift(createSyntheticSetTransaction(pathCurrentValue));
      }

      // Apply reducer to get consolidated value for this path
      const pathConsolidatedValue = config.reducer(pathTransactions);
      consolidatedValues[fieldPath] = pathConsolidatedValue;

      if (config.verbose) {
        console.log(
          `[EventualConsistency] ${config.resource}.${fieldPath} - ` +
          `${originalId}: ${pathCurrentValue} → ${pathConsolidatedValue} ` +
          `(${pathTransactions.length - (pathCurrentValue !== 0 ? 1 : 0)} pending txns)`
        );
      }
    }

    // 🔥 DEBUG: Log BEFORE update
    if (config.verbose) {
      console.log(
        `🔥 [DEBUG] BEFORE targetResource.update() {` +
        `\n  originalId: '${originalId}',` +
        `\n  consolidatedValues: ${JSON.stringify(consolidatedValues, null, 2)}` +
        `\n}`
      );
    }

    // Build update object using lodash.set for nested paths
    // Get fresh record to avoid overwriting other fields
    const [recordOk, recordErr, record] = await tryFn(() =>
      targetResource.get(originalId)
    );

    let updateOk, updateErr, updateResult;

    if (!recordOk || !record) {
      // Record doesn't exist - we'll let the update fail and handle it below
      // This ensures transactions remain pending until record is created
      if (config.verbose) {
        console.log(
          `[EventualConsistency] ${config.resource}.${config.field} - ` +
          `Record ${originalId} doesn't exist yet. Will attempt update anyway (expected to fail).`
        );
      }

      // Create a minimal record object with just our field
      const minimalRecord = { id: originalId };
      for (const [fieldPath, value] of Object.entries(consolidatedValues)) {
        lodash.set(minimalRecord, fieldPath, value);
      }

      // Try to update (will fail, handled below)
      const result = await tryFn(() =>
        targetResource.update(originalId, minimalRecord)
      );
      updateOk = result[0];
      updateErr = result[1];
      updateResult = result[2];
    } else {
      // Record exists - apply all consolidated values using lodash.set
      for (const [fieldPath, value] of Object.entries(consolidatedValues)) {
        lodash.set(record, fieldPath, value);
      }

      // Update the original record with all changes
      // NOTE: We update the entire record to preserve nested structures
      const result = await tryFn(() =>
        targetResource.update(originalId, record)
      );
      updateOk = result[0];
      updateErr = result[1];
      updateResult = result[2];
    }

    const consolidatedValue = consolidatedValues[config.field] ||
                             (record ? lodash.get(record, config.field, 0) : 0);

    // 🔥 DEBUG: Log AFTER update
    if (config.verbose) {
      console.log(
        `🔥 [DEBUG] AFTER targetResource.update() {` +
        `\n  updateOk: ${updateOk},` +
        `\n  updateErr: ${updateErr?.message || 'undefined'},` +
        `\n  consolidatedValue (main field): ${consolidatedValue}` +
        `\n}`
      );
    }

    // 🔥 VERIFY: Check if update actually persisted for all fieldPaths
    if (updateOk && config.verbose) {
      // Bypass cache to get fresh data
      const [verifyOk, verifyErr, verifiedRecord] = await tryFn(() =>
        targetResource.get(originalId, { skipCache: true })
      );

      // Verify each fieldPath
      for (const [fieldPath, expectedValue] of Object.entries(consolidatedValues)) {
        const actualValue = lodash.get(verifiedRecord, fieldPath);
        const match = actualValue === expectedValue;

        console.log(
          `🔥 [DEBUG] VERIFICATION ${fieldPath} {` +
          `\n  expectedValue: ${expectedValue},` +
          `\n  actualValue: ${actualValue},` +
          `\n  ${match ? '✅ MATCH' : '❌ MISMATCH'}` +
          `\n}`
        );

        // If verification fails, this is a critical bug
        if (!match) {
          console.error(
            `❌ [CRITICAL BUG] Update reported success but value not persisted!` +
            `\n  Resource: ${config.resource}` +
            `\n  FieldPath: ${fieldPath}` +
            `\n  Record ID: ${originalId}` +
            `\n  Expected: ${expectedValue}` +
            `\n  Actually got: ${actualValue}` +
            `\n  This indicates a bug in s3db.js resource.update()`
          );
        }
      }
    }

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

      // ✅ OTIMIZAÇÃO: Usar concurrency do config (default aumentado de 10 para 50)
      const markAppliedConcurrency = config.markAppliedConcurrency || 50;

      const { results, errors } = await PromisePool
        .for(transactionsToUpdate)
        .withConcurrency(markAppliedConcurrency)
        .process(async (txn) => {
          const txnWithCohorts = ensureCohortHour(txn, config.cohort.timezone, false);

          const updateData = { applied: true };

          // Add missing cohort fields if they were calculated
          if (txnWithCohorts.cohortHour && !txn.cohortHour) {
            updateData.cohortHour = txnWithCohorts.cohortHour;
          }
          if (txnWithCohorts.cohortDate && !txn.cohortDate) {
            updateData.cohortDate = txnWithCohorts.cohortDate;
          }
          if (txnWithCohorts.cohortWeek && !txn.cohortWeek) {
            updateData.cohortWeek = txnWithCohorts.cohortWeek;
          }
          if (txnWithCohorts.cohortMonth && !txn.cohortMonth) {
            updateData.cohortMonth = txnWithCohorts.cohortMonth;
          }

          const [ok, err] = await tryFn(() =>
            transactionResource.update(txn.id, updateData)
          );

          if (!ok && config.verbose) {
            console.warn(
              `[EventualConsistency] Failed to mark transaction ${txn.id} as applied:`,
              err?.message,
              'Update data:',
              updateData
            );
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
    if (lock) {
      const [lockReleased, lockReleaseErr] = await tryFn(() =>
        storage.releaseLock(lock)
      );

      if (!lockReleased && config.verbose) {
        console.warn(
          `[EventualConsistency] Failed to release lock ${lock?.name || lockKey}:`,
          lockReleaseErr?.message
        );
      }
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
 * @param {Object} storage - PluginStorage instance for locks
 * @param {Function} consolidateRecordFn - Function to consolidate the record
 * @param {Object} config - Plugin configuration
 * @returns {Promise<number>} Recalculated value
 */
export async function recalculateRecord(
  originalId,
  transactionResource,
  targetResource,
  storage,
  consolidateRecordFn,
  config
) {
  // Acquire distributed lock with TTL to prevent concurrent operations
  const lockKey = `recalculate-${config.resource}-${config.field}-${originalId}`;
  const lock = await storage.acquireLock(lockKey, {
    ttl: config.lockTimeout || 30,
    timeout: 0, // Don't wait if locked
    workerId: process.pid ? String(process.pid) : 'unknown'
  });

  // If lock couldn't be acquired, another worker is operating on this record
  if (!lock) {
    if (config.verbose) {
      console.log(`[EventualConsistency] Recalculate lock for ${originalId} already held, skipping`);
    }
    throw new PluginError(`Cannot recalculate ${originalId}: lock already held by another worker`, {
      pluginName: 'EventualConsistencyPlugin',
      operation: 'recalculateRecord',
      statusCode: 409,
      retriable: true,
      suggestion: 'Retry after the other worker releases the lock or increase lock TTL if necessary.',
      recordId: originalId
    });
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

    // Check if there's an anchor transaction
    const hasAnchor = allTransactions.some(txn => txn.source === 'anchor');

    // If no anchor exists, create one with value 0 to serve as the baseline
    // This ensures recalculate is idempotent - running it multiple times produces same result
    if (!hasAnchor) {
      const now = new Date();
      const cohortInfo = getCohortInfo(now, config.cohort.timezone, config.verbose);

      // Create anchor transaction with timestamp before all other transactions
      const oldestTransaction = allTransactions.sort((a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      )[0];

      const anchorTimestamp = oldestTransaction
        ? new Date(new Date(oldestTransaction.timestamp).getTime() - 1).toISOString()
        : now.toISOString();

      const anchorCohortInfo = getCohortInfo(new Date(anchorTimestamp), config.cohort.timezone, config.verbose);

      const anchorTransaction = {
        id: idGenerator(),
        originalId: originalId,
        field: config.field,
        fieldPath: config.field,
        value: 0,  // Always 0 for recalculate - we start from scratch
        operation: 'set',
        timestamp: anchorTimestamp,
        cohortDate: anchorCohortInfo.date,
        cohortHour: anchorCohortInfo.hour,
        cohortMonth: anchorCohortInfo.month,
        source: 'anchor',
        applied: true  // Anchor is always applied
      };

      await transactionResource.insert(anchorTransaction);

      if (config.verbose) {
        console.log(
          `[EventualConsistency] ${config.resource}.${config.field} - ` +
          `Created anchor transaction for ${originalId} with value 0`
        );
      }
    }

    // Mark ALL transactions as pending (applied: false)
    // Exclude anchor transactions (they should always be applied)
    const transactionsToReset = allTransactions.filter(txn => txn.source !== 'anchor');

    // ✅ OPTIMIZATION: Use higher concurrency for recalculate (default 50 vs 10)
    const recalculateConcurrency = config.recalculateConcurrency || 50;

    const { results, errors } = await PromisePool
      .for(transactionsToReset)
      .withConcurrency(recalculateConcurrency)
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
    if (lock) {
      const [lockReleased, lockReleaseErr] = await tryFn(() =>
        storage.releaseLock(lock)
      );

      if (!lockReleased && config.verbose) {
        console.warn(
          `[EventualConsistency] Failed to release recalculate lock ${lock?.name || lockKey}:`,
          lockReleaseErr?.message
        );
      }
    }
  }
}
