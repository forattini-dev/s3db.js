/**
 * Lock management for EventualConsistencyPlugin
 * @module eventual-consistency/locks
 */

import tryFn from '../../concerns/try-fn.js';

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
export async function cleanupStaleLocks(
  storage: PluginStorage,
  _config: { logLevel?: string }
): Promise<CleanupResult> {
  const result: CleanupResult = { cleaned: 0, errors: 0 };

  const [ok, err, lockKeys] = await tryFn(() =>
    storage.listKeys('lock:')
  );

  if (!ok || !lockKeys) {
    return result;
  }

  const now = Date.now();

  for (const key of lockKeys) {
    const [lockOk, , lockData] = await tryFn(() =>
      storage.get(key)
    ) as [boolean, Error | null, LockData | null];

    if (lockOk && lockData && lockData.expiresAt < now) {
      const [deleteOk] = await tryFn(() => storage.delete(key));
      if (deleteOk) {
        result.cleaned++;
      } else {
        result.errors++;
      }
    }
  }

  return result;
}
