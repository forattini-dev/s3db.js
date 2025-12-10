import type { Context, MiddlewareHandler } from 'hono';
export interface RateLimitConfig {
    windowMs?: number;
    maxRequests?: number;
    keyGenerator?: ((c: Context) => string) | null;
}
export declare function createRateLimitMiddleware(config?: RateLimitConfig): MiddlewareHandler;
//# sourceMappingURL=rate-limit.d.ts.map