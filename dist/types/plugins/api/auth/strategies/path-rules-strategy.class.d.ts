import type { MiddlewareHandler } from 'hono';
import { BaseAuthStrategy, type BaseAuthStrategyOptions } from './base-strategy.class.js';
import { type AuthRule } from '../path-auth-matcher.js';
export interface PathRulesAuthStrategyOptions extends BaseAuthStrategyOptions {
    pathRules: AuthRule[];
    events?: {
        emitAuthEvent: (event: string, data: Record<string, unknown>) => void;
    } | null;
}
export declare class PathRulesAuthStrategy extends BaseAuthStrategy {
    private pathRules;
    private events;
    constructor({ drivers, authResource, oidcMiddleware, database, pathRules, events, logLevel, logger }: PathRulesAuthStrategyOptions);
    createMiddleware(): Promise<MiddlewareHandler>;
}
//# sourceMappingURL=path-rules-strategy.class.d.ts.map