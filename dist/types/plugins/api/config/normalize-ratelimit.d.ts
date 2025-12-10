import type { Logger } from '../../../concerns/logger.js';
import type { Context } from 'hono';
export interface RawRateLimitRule {
    path?: string;
    pattern?: string;
    windowMs?: number;
    maxRequests?: number;
    maxUniqueKeys?: number;
    key?: string;
    scope?: string;
    keyHeader?: string;
    header?: string;
    keyGenerator?: ((c: Context) => string) | null;
}
export interface NormalizedRateLimitRule {
    id: string;
    pattern: string;
    windowMs?: number;
    maxRequests?: number;
    maxUniqueKeys?: number;
    key: string;
    keyHeader: string;
    keyGenerator: ((c: Context) => string) | null;
}
export declare function normalizeRateLimitRules(rules: RawRateLimitRule[] | null | undefined, logger: Logger | null): NormalizedRateLimitRule[];
//# sourceMappingURL=normalize-ratelimit.d.ts.map