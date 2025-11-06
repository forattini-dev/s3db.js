/**
 * Garbage collection for EventualConsistencyPlugin
 * @module eventual-consistency/garbage-collection
 */

import tryFn from "../../concerns/try-fn.js";
import { PromisePool } from "@supercharge/promise-pool";
import { getCronManager } from "../../concerns/cron-manager.js";

/**
 * Start garbage collection timer for a handler
 *
 * @param {Object} handler - Field handler
 * @param {string} resourceName - Resource name
 * @param {string} fieldName - Field name
 * @param {Function} runGCCallback - Callback to run GC
 * @param {Object} config - Plugin configuration
 * @returns {string} GC job name
 */
export function startGarbageCollectionTimer(handler, resourceName, fieldName, runGCCallback, config) {
  const gcIntervalMs = config.gcInterval * 1000; // Convert seconds to ms
  const cronManager = getCronManager();
  const jobName = `gc-${resourceName}-${fieldName}-${Date.now()}`;

  cronManager.scheduleInterval(
    gcIntervalMs,
    async () => {
      await runGCCallback(handler, resourceName, fieldName);
    },
    jobName
  );

  handler.gcJobName = jobName;
  return jobName;
}

/**
 * Delete old applied transactions based on retention policy
 * Uses distributed locking to prevent multiple containers from running GC simultaneously
 *
 * @param {Object} transactionResource - Transaction resource
 * @param {Object} storage - PluginStorage instance for locks
 * @param {Object} config - Plugin configuration
 * @param {Function} emitFn - Function to emit events
 * @returns {Promise<void>}
 */
export async function runGarbageCollection(transactionResource, storage, config, emitFn) {
  // Acquire distributed lock with TTL for GC operation
  const lockKey = `gc-${config.resource}-${config.field}`;
  const lock = await storage.acquireLock(lockKey, {
    ttl: 300, // 5 minutes for GC
    timeout: 0, // Don't wait if locked
    workerId: process.pid ? String(process.pid) : 'unknown'
  });

  // If another container is already running GC, skip
  if (!lock) {
    if (config.verbose) {
    }
    return;
  }

  try {
    const now = Date.now();
    const retentionMs = config.transactionRetention * 24 * 60 * 60 * 1000; // Days to ms
    const cutoffDate = new Date(now - retentionMs);
    const cutoffIso = cutoffDate.toISOString();

    if (config.verbose) {
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
      }
      return;
    }

    if (!oldTransactions || oldTransactions.length === 0) {
      if (config.verbose) {
      }
      return;
    }

    if (config.verbose) {
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
    }

    if (emitFn) {
      emitFn('plg:eventual-consistency:gc-completed', {
        resource: config.resource,
        field: config.field,
        deletedCount: results.length,
        errorCount: errors.length
      });
    }
  } catch (error) {
    if (config.verbose) {
    }
    if (emitFn) {
      emitFn('plg:eventual-consistency:gc-error', error);
    }
  } finally {
    // Always release GC lock
    if (lock) {
      await tryFn(() => storage.releaseLock(lock));
    }
  }
}
