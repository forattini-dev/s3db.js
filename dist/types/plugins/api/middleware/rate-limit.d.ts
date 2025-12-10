import type { Context, Next } from 'hono';
export interface RateLimitRule {
    id: string;
    pattern: string;
    windowMs?: number;
    maxRequests?: number;
    maxUniqueKeys?: number;
    key?: string;
    keyHeader?: string;
    keyGenerator?: ((c: Context) => string) | null;
}
export interface RateLimitConfig {
    windowMs: number;
    maxRequests: number;
    maxUniqueKeys: number;
    keyGenerator?: (c: Context) => string;
    rules?: RateLimitRule[];
}
export declare function createRateLimitMiddleware(rateLimitConfig: RateLimitConfig): Promise<(c: Context, next: Next) => Promise<Response | void>>;
//# sourceMappingURL=rate-limit.d.ts.map