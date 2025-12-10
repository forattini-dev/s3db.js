/**
 * Sliding window rate limiter for IP-based throttling
 */
import type { Context, Next } from 'hono';
export interface RateLimiterOptions {
    windowMs?: number;
    max?: number;
}
export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    retryAfter: number;
}
export declare class RateLimiter {
    private windowMs;
    private max;
    private buckets;
    constructor(options?: RateLimiterOptions);
    consume(key: string): RateLimitResult;
    enabled(): boolean;
    private _prune;
}
export declare function createJsonRateLimitMiddleware(limiter: RateLimiter, getKey: (c: Context) => string): (c: Context, next: Next) => Promise<Response | void>;
export declare function createRedirectRateLimitMiddleware(limiter: RateLimiter, getKey: (c: Context) => string, buildRedirectUrl: (retryAfter: number) => string): (c: Context, next: Next) => Promise<Response | void>;
export default RateLimiter;
//# sourceMappingURL=rate-limit.d.ts.map