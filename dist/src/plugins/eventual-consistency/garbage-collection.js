/**
 * Garbage collection for EventualConsistencyPlugin
 * @module eventual-consistency/garbage-collection
 */
import tryFn from '../../concerns/try-fn.js';
import { PromisePool } from '@supercharge/promise-pool';
import { getCronManager } from '../../concerns/cron-manager.js';
/**
 * Start garbage collection timer for a handler
 *
 * @param handler - Field handler
 * @param resourceName - Resource name
 * @param fieldName - Field name
 * @param runGCCallback - Callback to run GC
 * @param config - Plugin configuration
 * @returns GC job name
 */
export function startGarbageCollectionTimer(handler, resourceName, fieldName, runGCCallback, config) {
    const gcIntervalMs = config.gcInterval * 1000;
    const cronManager = getCronManager();
    const jobName = `gc-${resourceName}-${fieldName}-${Date.now()}`;
    cronManager.scheduleInterval(gcIntervalMs, async () => {
        await runGCCallback(handler, resourceName, fieldName);
    }, jobName);
    handler.gcJobName = jobName;
    return jobName;
}
/**
 * Delete old applied transactions based on retention policy
 * Uses distributed locking to prevent multiple containers from running GC simultaneously
 *
 * @param transactionResource - Transaction resource
 * @param storage - PluginStorage instance for locks
 * @param config - Plugin configuration
 * @param emitFn - Function to emit events
 */
export async function runGarbageCollection(transactionResource, storage, config, emitFn) {
    const lockKey = `gc-${config.resource}-${config.field}`;
    const lock = await storage.acquireLock(lockKey, {
        ttl: 300,
        timeout: 0,
        workerId: process.pid ? String(process.pid) : 'unknown'
    });
    if (!lock) {
        return;
    }
    try {
        const now = Date.now();
        const retentionMs = config.transactionRetention * 24 * 60 * 60 * 1000;
        const cutoffDate = new Date(now - retentionMs);
        const cutoffIso = cutoffDate.toISOString();
        const [ok, err, oldTransactions] = await tryFn(() => transactionResource.query({
            applied: true,
            timestamp: { '<': cutoffIso }
        }));
        if (!ok) {
            return;
        }
        if (!oldTransactions || oldTransactions.length === 0) {
            return;
        }
        const { results, errors } = await PromisePool
            .for(oldTransactions)
            .withConcurrency(10)
            .process(async (txn) => {
            const [deleted] = await tryFn(() => transactionResource.delete(txn.id));
            return deleted;
        });
        if (emitFn) {
            emitFn('plg:eventual-consistency:gc-completed', {
                resource: config.resource,
                field: config.field,
                deletedCount: results.length,
                errorCount: errors.length
            });
        }
    }
    catch (error) {
        if (emitFn) {
            emitFn('plg:eventual-consistency:gc-error', error);
        }
    }
    finally {
        if (lock) {
            await tryFn(() => storage.releaseLock(lock));
        }
    }
}
//# sourceMappingURL=garbage-collection.js.map