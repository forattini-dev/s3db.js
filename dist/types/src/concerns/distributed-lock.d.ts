export interface LockDefaults {
    ttl?: number;
    timeout?: number;
    retryDelay?: number;
    maxRetryDelay?: number;
    workerId?: string;
}
export interface AcquireOptions extends LockDefaults {
    ttl?: number;
    timeout?: number;
    workerId?: string;
    retryDelay?: number;
    maxRetryDelay?: number;
}
export interface LockHandle {
    name: string;
    key: string;
    token: string;
    workerId: string;
    expiresAt: number;
    etag: string | null;
}
export interface LockInfo {
    workerId: string;
    token: string;
    acquiredAt: number;
    _expiresAt: number;
}
export interface StorageAdapter {
    get(key: string): Promise<LockInfo | null>;
    set(key: string, data: LockInfo, options?: SetOptions): Promise<{
        ETag?: string;
    }>;
    delete(key: string): Promise<void>;
}
export interface SetOptions {
    ttl?: number;
    behavior?: string;
    ifNoneMatch?: string;
}
export interface DistributedLockOptions {
    keyGenerator?: (name: string) => string;
    defaults?: LockDefaults;
}
interface PreconditionError extends Error {
    original?: {
        code?: string;
        Code?: string;
        name?: string;
        statusCode?: number;
        $metadata?: {
            httpStatusCode?: number;
        };
    };
    code?: string;
    Code?: string;
    statusCode?: number;
    $metadata?: {
        httpStatusCode?: number;
    };
}
export declare function computeBackoff(attempt: number, baseDelay: number, maxDelay: number): number;
export declare function sleep(ms: number): Promise<void>;
export declare function isPreconditionFailure(err: PreconditionError | null | undefined): boolean;
export declare class DistributedLock {
    storage: StorageAdapter;
    keyGenerator: (name: string) => string;
    defaults: Required<LockDefaults>;
    constructor(storage: StorageAdapter, options?: DistributedLockOptions);
    acquire(lockName: string, options?: AcquireOptions): Promise<LockHandle | null>;
    release(lock: LockHandle | string, token?: string): Promise<void>;
    withLock<T>(lockName: string, options: AcquireOptions, callback: (lock: LockHandle) => Promise<T>): Promise<T | null>;
    isLocked(lockName: string): Promise<boolean>;
    getLockInfo(lockName: string): Promise<LockInfo | null>;
}
export declare function createLockedFunction<T>(lock: DistributedLock, lockName: string, options?: AcquireOptions): (callback: (lock: LockHandle) => Promise<T>) => Promise<T | null>;
export default DistributedLock;
//# sourceMappingURL=distributed-lock.d.ts.map