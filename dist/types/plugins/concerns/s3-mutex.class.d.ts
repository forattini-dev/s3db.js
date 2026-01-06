import { PluginStorage } from '../../concerns/plugin-storage.js';
export interface LockResult {
    acquired: boolean;
    lockId?: string;
    expiresAt?: number;
    error?: Error;
}
export interface LockData {
    lockId: string;
    holderId: string;
    acquiredAt: number;
    expiresAt: number;
}
export declare class S3Mutex {
    protected storage: PluginStorage;
    protected namespace: string;
    protected holderId: string;
    constructor(storage: PluginStorage, namespace?: string);
    lock(key: string, ttlMs?: number): Promise<LockResult>;
    tryLock(key: string, ttlMs?: number): Promise<LockResult>;
    unlock(key: string, lockId: string): Promise<boolean>;
    isLocked(key: string): Promise<boolean>;
    extend(key: string, lockId: string, ttlMs: number): Promise<boolean>;
    getLockInfo(key: string): Promise<LockData | null>;
    protected _getLockKey(key: string): string;
    protected _generateLockId(): string;
    protected _generateHolderId(): string;
}
export default S3Mutex;
//# sourceMappingURL=s3-mutex.class.d.ts.map