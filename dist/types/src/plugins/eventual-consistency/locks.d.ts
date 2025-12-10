/**
 * Lock management for EventualConsistencyPlugin
 * @module eventual-consistency/locks
 */
export interface PluginStorage {
    listKeys(prefix?: string): Promise<string[]>;
    get(key: string): Promise<any>;
    delete(key: string): Promise<void>;
    acquireLock(key: string, options: LockOptions): Promise<Lock | null>;
    releaseLock(lock: Lock): Promise<void>;
}
export interface LockOptions {
    ttl: number;
    timeout?: number;
    workerId?: string;
}
export interface Lock {
    key: string;
    workerId: string;
    expiresAt: number;
}
export interface LockData {
    workerId: string;
    expiresAt: number;
}
export interface CleanupResult {
    cleaned: number;
    errors: number;
}
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
export declare function cleanupStaleLocks(storage: PluginStorage, config: {
    logLevel?: string;
}): Promise<CleanupResult>;
//# sourceMappingURL=locks.d.ts.map