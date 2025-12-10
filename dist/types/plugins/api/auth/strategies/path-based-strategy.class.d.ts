import type { MiddlewareHandler } from 'hono';
import { BaseAuthStrategy, type BaseAuthStrategyOptions } from './base-strategy.class.js';
import { type PathAuthRule as BasePathAuthRule } from '../../utils/path-matcher.js';
export interface PathAuthRule extends Partial<BasePathAuthRule> {
    path?: string;
}
export interface PathBasedAuthStrategyOptions extends BaseAuthStrategyOptions {
    pathAuth: PathAuthRule[];
}
export declare class PathBasedAuthStrategy extends BaseAuthStrategy {
    private pathAuth;
    constructor({ drivers, authResource, oidcMiddleware, database, pathAuth, logLevel, logger }: PathBasedAuthStrategyOptions);
    createMiddleware(): Promise<MiddlewareHandler>;
}
//# sourceMappingURL=path-based-strategy.class.d.ts.map