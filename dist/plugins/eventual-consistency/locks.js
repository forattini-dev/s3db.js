/**
 * Lock management for EventualConsistencyPlugin
 * @module eventual-consistency/locks
 */
import tryFn from '../../concerns/try-fn.js';
/**
 * Cleanup stale locks (used by coordinator)
 *
 * Locks with TTL are now managed by PluginStorage. This function
 * scans for any orphaned lock entries and cleans them up.
 *
 * @param storage - PluginStorage instance
 * @param config - Plugin configuration
 * @returns Cleanup results
 */
export async function cleanupStaleLocks(storage, config) {
    const result = { cleaned: 0, errors: 0 };
    const [ok, err, lockKeys] = await tryFn(() => storage.listKeys('lock:'));
    if (!ok || !lockKeys) {
        return result;
    }
    const now = Date.now();
    for (const key of lockKeys) {
        const [lockOk, lockErr, lockData] = await tryFn(() => storage.get(key));
        if (lockOk && lockData && lockData.expiresAt < now) {
            const [deleteOk] = await tryFn(() => storage.delete(key));
            if (deleteOk) {
                result.cleaned++;
            }
            else {
                result.errors++;
            }
        }
    }
    return result;
}
//# sourceMappingURL=locks.js.map