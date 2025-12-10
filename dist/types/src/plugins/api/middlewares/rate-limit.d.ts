import type { Context, MiddlewareHandler } from 'hono';
export interface RateLimitEntry {
    attempts: number[];
}
export interface RateLimitStoreOptions {
    cleanupInterval?: number;
    windowMs?: number;
}
export interface RateLimitStoreStats {
    totalKeys: number;
    totalAttempts: number;
}
export declare class RateLimitStore {
    private store;
    private cleanupInterval;
    private windowMs;
    private cronManager;
    private cleanupJobName;
    constructor(options?: RateLimitStoreOptions);
    record(key: string): number;
    getCount(key: string): number;
    reset(key: string): void;
    getRetryAfter(key: string): number;
    private cleanup;
    stop(): void;
    getStats(): RateLimitStoreStats;
}
export interface RateLimitExceededInfo {
    retryAfter: number;
}
export type RateLimitHandler = (c: Context, info: RateLimitExceededInfo) => Response | Promise<Response>;
export type KeyGenerator = (c: Context) => string | Promise<string>;
export interface DriverRateLimiterConfig {
    windowMs?: number;
    maxAttempts?: number;
    keyPrefix?: string;
    keyGenerator?: KeyGenerator | null;
    skipSuccessfulRequests?: boolean;
    handler?: RateLimitHandler | null;
    enabled?: boolean;
}
export declare function createDriverRateLimiter(config?: DriverRateLimiterConfig): MiddlewareHandler;
export type AuthDriverType = 'oidc' | 'jwt' | 'basic' | 'apikey';
export declare function createAuthDriverRateLimiter(driver: AuthDriverType, config?: DriverRateLimiterConfig): MiddlewareHandler;
declare const _default: {
    createDriverRateLimiter: typeof createDriverRateLimiter;
    createAuthDriverRateLimiter: typeof createAuthDriverRateLimiter;
    RateLimitStore: typeof RateLimitStore;
};
export default _default;
//# sourceMappingURL=rate-limit.d.ts.map