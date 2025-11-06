/**
 * Distributed locking for EventualConsistencyPlugin
 * @module eventual-consistency/locks
 */

import tryFn from "../../concerns/try-fn.js";
import { PromisePool } from "@supercharge/promise-pool";

/**
 * Clean up stale locks that exceed the configured timeout
 * Uses distributed locking to prevent multiple containers from cleaning simultaneously
 *
 * @param {Object} lockResource - Lock resource instance
 * @param {Object} config - Plugin configuration
 * @returns {Promise<void>}
 */
export async function cleanupStaleLocks(lockResource, config) {
  const now = Date.now();
  const lockTimeoutMs = config.lockTimeout * 1000; // Convert seconds to ms
  const cutoffTime = now - lockTimeoutMs;

  // Acquire distributed lock for cleanup operation
  const cleanupLockId = `lock-cleanup-${config.resource}-${config.field}`;
  const [lockAcquired] = await tryFn(() =>
    lockResource.insert({
      id: cleanupLockId,
      lockedAt: Date.now(),
      workerId: process.pid ? String(process.pid) : 'unknown'
    })
  );

  // If another container is already cleaning, skip
  if (!lockAcquired) {
    if (config.verbose) {
    }
    return;
  }

  try {
    // Get all locks
    const [ok, err, locks] = await tryFn(() => lockResource.list());

    if (!ok || !locks || locks.length === 0) return;

    // Find stale locks (excluding the cleanup lock itself)
    const staleLocks = locks.filter(lock =>
      lock.id !== cleanupLockId && lock.lockedAt < cutoffTime
    );

    if (staleLocks.length === 0) return;

    if (config.verbose) {
    }

    // Delete stale locks using PromisePool
    const { results, errors } = await PromisePool
      .for(staleLocks)
      .withConcurrency(5)
      .process(async (lock) => {
        const [deleted] = await tryFn(() => lockResource.delete(lock.id));
        return deleted;
      });

    if (errors && errors.length > 0 && config.verbose) {
    }
  } catch (error) {
    if (config.verbose) {
    }
  } finally {
    // Always release cleanup lock
    await tryFn(() => lockResource.delete(cleanupLockId));
  }
}
