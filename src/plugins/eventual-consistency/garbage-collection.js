/**
 * Garbage collection for EventualConsistencyPlugin
 * @module eventual-consistency/garbage-collection
 */

import tryFn from "../../concerns/try-fn.js";
import { PromisePool } from "@supercharge/promise-pool";

/**
 * Start garbage collection timer for a handler
 *
 * @param {Object} handler - Field handler
 * @param {string} resourceName - Resource name
 * @param {string} fieldName - Field name
 * @param {Function} runGCCallback - Callback to run GC
 * @param {Object} config - Plugin configuration
 * @returns {NodeJS.Timeout} GC timer
 */
export function startGarbageCollectionTimer(handler, resourceName, fieldName, runGCCallback, config) {
  const gcIntervalMs = config.gcInterval * 1000; // Convert seconds to ms

  handler.gcTimer = setInterval(async () => {
    await runGCCallback(handler, resourceName, fieldName);
  }, gcIntervalMs);

  return handler.gcTimer;
}

/**
 * Delete old applied transactions based on retention policy
 * Uses distributed locking to prevent multiple containers from running GC simultaneously
 *
 * @param {Object} transactionResource - Transaction resource
 * @param {Object} lockResource - Lock resource
 * @param {Object} config - Plugin configuration
 * @param {Function} emitFn - Function to emit events
 * @returns {Promise<void>}
 */
export async function runGarbageCollection(transactionResource, lockResource, config, emitFn) {
  // Acquire distributed lock for GC operation
  const gcLockId = `lock-gc-${config.resource}-${config.field}`;
  const [lockAcquired] = await tryFn(() =>
    lockResource.insert({
      id: gcLockId,
      lockedAt: Date.now(),
      workerId: process.pid ? String(process.pid) : 'unknown'
    })
  );

  // If another container is already running GC, skip
  if (!lockAcquired) {
    if (config.verbose) {
      console.log(`[EventualConsistency] GC already running in another container`);
    }
    return;
  }

  try {
    const now = Date.now();
    const retentionMs = config.transactionRetention * 24 * 60 * 60 * 1000; // Days to ms
    const cutoffDate = new Date(now - retentionMs);
    const cutoffIso = cutoffDate.toISOString();

    if (config.verbose) {
      console.log(`[EventualConsistency] Running GC for transactions older than ${cutoffIso} (${config.transactionRetention} days)`);
    }

    // Query old applied transactions
    const [ok, err, oldTransactions] = await tryFn(() =>
      transactionResource.query({
        applied: true,
        timestamp: { '<': cutoffIso }
      })
    );

    if (!ok) {
      if (config.verbose) {
        console.warn(`[EventualConsistency] GC failed to query transactions:`, err?.message);
      }
      return;
    }

    if (!oldTransactions || oldTransactions.length === 0) {
      if (config.verbose) {
        console.log(`[EventualConsistency] No old transactions to clean up`);
      }
      return;
    }

    if (config.verbose) {
      console.log(`[EventualConsistency] Deleting ${oldTransactions.length} old transactions`);
    }

    // Delete old transactions using PromisePool
    const { results, errors } = await PromisePool
      .for(oldTransactions)
      .withConcurrency(10)
      .process(async (txn) => {
        const [deleted] = await tryFn(() => transactionResource.delete(txn.id));
        return deleted;
      });

    if (config.verbose) {
      console.log(`[EventualConsistency] GC completed: ${results.length} deleted, ${errors.length} errors`);
    }

    if (emitFn) {
      emitFn('eventual-consistency.gc-completed', {
        resource: config.resource,
        field: config.field,
        deletedCount: results.length,
        errorCount: errors.length
      });
    }
  } catch (error) {
    if (config.verbose) {
      console.warn(`[EventualConsistency] GC error:`, error.message);
    }
    if (emitFn) {
      emitFn('eventual-consistency.gc-error', error);
    }
  } finally {
    // Always release GC lock
    await tryFn(() => lockResource.delete(gcLockId));
  }
}
